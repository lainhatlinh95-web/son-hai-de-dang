/* ============================================================
   One-time backfill by scrolling the group CHRONOLOGICALLY
   (newest → oldest) and harvesting every Google Doc link along
   the way. This is the complete method: it sees every post in
   order, so there are no search-relevance gaps.

   Resumable + incremental: reads existing data/chapters.json,
   skips known docs, and saves as it goes. Stops when the feed
   stops growing (reached the oldest post) or a safety cap/login
   wall is hit.

   Usage: node backfill-scroll.mjs [maxScrolls]
   ============================================================ */
import { chromium } from 'playwright';
import { loadConfig, loadChapters, saveChapters, STATE_PATH, hasSession } from './util.mjs';
import { extractDocIds } from './scrape.mjs';
import { parseChapter, parseHeading } from './parse.mjs';

const cfg = loadConfig();
const MAX_SCROLLS = parseInt(process.argv[2], 10) || 700;
const STALL_LIMIT = 12;          // stop after this many scrolls with no height growth
const SCROLL_DELAY = 1500;

if (!hasSession()) { console.error('No FB session — run: node login.mjs'); process.exit(1); }
const url = `${cfg.fbGroupUrl.replace(/\/+$/, '')}/?sorting_setting=CHRONOLOGICAL`;

const chapters = loadChapters();
const collected = new Set(chapters.map((c) => c.num));
const seenDocIds = new Set(chapters.map((c) => c.docId).filter(Boolean));

async function fetchDocText(id) {
  const res = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  if (!txt || txt.replace(/\s/g, '').length < 40) throw new Error('empty');
  return txt;
}

async function ingest(id) {
  if (seenDocIds.has(id)) return false;
  seenDocIds.add(id);
  try {
    const txt = await fetchDocText(id);
    const head = txt.split('\n').find((l) => parseHeading(l)) || '';
    const ch = parseChapter(txt, { sourceUrl: `https://docs.google.com/document/d/${id}/edit`, postTitle: head });
    if (!ch || collected.has(ch.num)) return false;
    chapters.push({ num: ch.num, title: ch.title, paragraphs: ch.paragraphs,
                    sourceUrl: `https://docs.google.com/document/d/${id}/edit`, docId: id, addedAt: Date.now() });
    collected.add(ch.num);
    return true;
  } catch { return false; }
}

console.log(`Chronological backfill. Have ${chapters.length}. Scrolling up to ${MAX_SCROLLS}×.`);
const browser = await chromium.launch({ headless: cfg.headless !== false });
const ctx = await browser.newContext({ storageState: STATE_PATH });
const page = await ctx.newPage();

let added = 0, dirty = 0;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  if (/\/login|\/checkpoint/.test(page.url())) { console.error('Login wall — re-run login.mjs'); }

  let lastHeight = 0, stall = 0;
  for (let i = 0; i < MAX_SCROLLS; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_DELAY);

    const html = await page.content();
    for (const id of extractDocIds(html)) {
      if (await ingest(id)) { added++; dirty++; }
    }
    if (dirty >= 5) { saveChapters(chapters); dirty = 0; }

    const height = await page.evaluate(() => document.body.scrollHeight);
    if (height <= lastHeight) stall++; else { stall = 0; lastHeight = height; }

    if (i % 10 === 9 || stall >= STALL_LIMIT) {
      const ns = [...collected].sort((a, b) => a - b);
      console.log(`scroll ${i + 1}/${MAX_SCROLLS} | total=${chapters.length} | range ${ns[0]}–${ns[ns.length - 1]} | stall=${stall}`);
    }
    if (stall >= STALL_LIMIT) { console.log('Reached end of feed (no more posts loading).'); break; }
  }
} finally {
  saveChapters(chapters);
  await browser.close();
}
const ns = [...collected].sort((a, b) => a - b);
console.log(`Done. added=${added} total=${chapters.length} range ${ns[0]}–${ns[ns.length - 1]}`);
