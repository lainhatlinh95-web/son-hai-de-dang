/* ============================================================
   crawl-khotruyenchu.mjs — one-off backfill from khotruyenchu.fun

   The Facebook scraper dead-ends at chapter 771; chapters 1–770
   (and a few in-range gaps) can't come from FB. This site hosts
   the full novel, so we pull any chapter that's missing locally.

   Source list:  https://khotruyenchu.fun/truyen/son-hai-de-dang/page/N/
   Chapter page: https://khotruyenchu.fun/chuong-<N>-<slug>/
                 -> <h1>Chương N: title</h1>
                 -> <div class="entry-content"> <p>…<br/>…</p> </div>

   Writes/merges ../data/chapters.json (same shape the reader expects:
   { num, title, paragraphs, sourceUrl, addedAt }). Idempotent: only
   fetches chapters whose `num` is not already present.

   Usage:
     node crawl-khotruyenchu.mjs            # backfill every missing chapter
     node crawl-khotruyenchu.mjs --max 770  # only chapters <= 770
     node crawl-khotruyenchu.mjs --dry      # discover + report, don't write
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data', 'chapters.json');
const BASE = 'https://khotruyenchu.fun';
const LIST = `${BASE}/truyen/son-hai-de-dang/`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MAX = (() => { const i = args.indexOf('--max'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const CONCURRENCY = 5;
const CHAP_RE = /Chương\s*0*(\d+)\s*[:：.\-]?\s*(.*)$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'vi,en;q=0.8' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === tries) throw e;
      await sleep(800 * attempt);
    }
  }
}

function decode(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&hellip;/g, '…')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&(ldquo|rdquo);/g, '"')
    .replace(/&(lsquo|rsquo);/g, '’')
    .replace(/&raquo;/g, '»').replace(/&laquo;/g, '«')
    .replace(/\s+/g, ' ')
    .trim();
}

// Collect { num -> url } across every paginated list page.
async function discoverChapters() {
  const map = new Map();
  let page = 1;
  let lastPage = 1;
  while (page <= lastPage) {
    const url = page === 1 ? LIST : `${LIST}page/${page}/`;
    const html = await get(url);
    if (!html) break;
    // learn the highest page number from the pager links
    for (const m of html.matchAll(/son-hai-de-dang\/page\/(\d+)\//g)) {
      lastPage = Math.max(lastPage, parseInt(m[1], 10));
    }
    let found = 0;
    for (const m of html.matchAll(/href="https:\/\/khotruyenchu\.fun\/(chuong-(\d+)-[^"#]*)"/g)) {
      const num = parseInt(m[2], 10);
      if (!map.has(num)) { map.set(num, `${BASE}/${m[1]}`); found++; }
    }
    process.stdout.write(`  page ${page}/${lastPage}: +${found} (total ${map.size})\n`);
    page++;
    await sleep(300);
  }
  return map;
}

function parseChapterHtml(html, url) {
  const h1m = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1]));
  const heading = h1m.find((t) => CHAP_RE.test(t)) || h1m[0] || '';
  const hm = heading.match(CHAP_RE);
  if (!hm) return null;
  const num = parseInt(hm[1], 10);
  const title = (hm[2] || '').trim();

  let i = html.indexOf('class="entry-content');
  if (i < 0) return null;
  let region = html.slice(i);
  const cut = region.search(/id="comments"|class="entry-footer"|wpdiscuz|class="related|class="post-navigation/);
  if (cut > 0) region = region.slice(0, cut);

  const paras = [];
  for (const b of [...region.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1])) {
    for (const line of b.split(/<br\s*\/?>/i)) {
      const t = decode(line);
      if (t) paras.push(t);
    }
  }
  const clean = paras.filter(
    (p) => !/^(Chương\s+(sau|trước)|Mục lục|Cỡ chữ|A[-+]$|Giao diện|≣|Báo lỗi|Theo dõi)/i.test(p)
  );
  if (clean.length < 3) return null;
  return { num, title, paragraphs: clean, sourceUrl: url };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const cur = idx++;
        out[cur] = await fn(items[cur], cur);
      }
    })
  );
  return out;
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const have = new Set(existing.map((c) => c.num));
  console.log(`Local chapters: ${existing.length} (have ${have.size} unique nums)`);

  console.log('Discovering chapters on source…');
  const all = await discoverChapters();
  console.log(`Source lists ${all.size} chapters.`);

  const missing = [...all.keys()]
    .filter((n) => !have.has(n) && n <= MAX)
    .sort((a, b) => a - b);
  console.log(`Missing locally${MAX !== Infinity ? ` (<= ${MAX})` : ''}: ${missing.length}`);
  if (!missing.length) { console.log('Nothing to do.'); return; }

  if (DRY) {
    console.log('DRY RUN — would fetch:', missing.join(', '));
    return;
  }

  let ok = 0, fail = 0;
  const fetched = await mapLimit(missing, CONCURRENCY, async (num) => {
    try {
      const html = await get(all.get(num));
      const ch = html && parseChapterHtml(html, all.get(num));
      if (!ch) { fail++; process.stdout.write(`  ✗ ch ${num} (parse)\n`); return null; }
      ch.addedAt = new Date().toISOString();
      ok++;
      if (ok % 25 === 0) process.stdout.write(`  …${ok} fetched\n`);
      return ch;
    } catch (e) {
      fail++; process.stdout.write(`  ✗ ch ${num}: ${e.message}\n`);
      return null;
    }
  });

  const merged = existing.concat(fetched.filter(Boolean));
  merged.sort((a, b) => a.num - b.num);
  fs.writeFileSync(DATA, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nDone. Added ${ok}, failed ${fail}. Total now ${merged.length}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
