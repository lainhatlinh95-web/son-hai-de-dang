/* ============================================================
   One-time backfill via Facebook group SEARCH.
   For each chapter number we don't have yet, search the group
   for "Chương N". Each search surfaces ~several chapter posts,
   so we harvest every Google Doc it returns, fetch each new one
   once, and store it under whatever chapter number it actually
   is. Numbers collected as a side effect are skipped.

   Resumable: reads existing data/chapters.json and skips what's
   already there. Saves incrementally so progress is never lost.
   Throttled + block-aware so Facebook doesn't lock the session.

   Usage:
     node backfill.mjs              # 1 .. current max (or 869)
     node backfill.mjs 1 869        # explicit range
   ============================================================ */
import { chromium } from 'playwright';
import { loadConfig, loadChapters, saveChapters, STATE_PATH, hasSession } from './util.mjs';
import { extractDocIds } from './scrape.mjs';
import { parseChapter, parseHeading } from './parse.mjs';

const cfg = loadConfig();
const groupBase = cfg.fbGroupUrl.replace(/\/+$/, '');
const SEARCH_DELAY = 1600;        // ms between searches (be gentle)
const MAX_CONSEC_EMPTY = 30;      // stop if this many searches in a row add nothing

const argStart = parseInt(process.argv[2], 10);
const argEnd = parseInt(process.argv[3], 10);

if (!hasSession()) { console.error('No FB session — run: node login.mjs'); process.exit(1); }

const chapters = loadChapters();
const collected = new Set(chapters.map((c) => c.num));
const seenDocIds = new Set(chapters.map((c) => c.docId).filter(Boolean));

const endN = Number.isFinite(argEnd) ? argEnd : Math.max(869, ...collected, 0);
const startN = Number.isFinite(argStart) ? argStart : 1;

console.log(`Backfill ${endN} → ${startN}. Have ${chapters.length} already.`);

const browser = await chromium.launch({ headless: cfg.headless !== false });
const ctx = await browser.newContext({ storageState: STATE_PATH });
const page = await ctx.newPage();

async function fetchDocText(id) {
  const res = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  if (!txt || txt.replace(/\s/g, '').length < 40) throw new Error('empty');
  return txt;
}

let consecEmpty = 0, searches = 0, added = 0, dirty = 0;
try {
  for (let n = endN; n >= startN; n--) {
    if (collected.has(n)) continue;

    const url = `${groupBase}/search/?q=${encodeURIComponent('Chương ' + n)}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch { /* transient nav error — skip this one */ consecEmpty++; continue; }
    await page.waitForTimeout(3000);

    if (/\/login|\/checkpoint/.test(page.url())) {
      console.error('Facebook login wall — session lost. Saved progress; re-run login.mjs then this script.');
      break;
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);

    const html = await page.content();
    const ids = extractDocIds(html).filter((id) => !seenDocIds.has(id));
    searches++;

    let gotNew = 0;
    for (const id of ids) {
      seenDocIds.add(id);
      try {
        const txt = await fetchDocText(id);
        const head = (txt.split('\n').find((l) => parseHeading(l)) || '');
        const ch = parseChapter(txt, { sourceUrl: `https://docs.google.com/document/d/${id}/edit`, postTitle: head });
        if (!ch || collected.has(ch.num)) continue;
        chapters.push({ num: ch.num, title: ch.title, paragraphs: ch.paragraphs,
                        sourceUrl: `https://docs.google.com/document/d/${id}/edit`, docId: id, addedAt: Date.now() });
        collected.add(ch.num);
        added++; gotNew++; dirty++;
      } catch { /* skip bad doc */ }
    }

    if (gotNew) { consecEmpty = 0; } else { consecEmpty++; }
    if (gotNew || searches % 5 === 0) {
      if (dirty) { saveChapters(chapters); dirty = 0; }
      console.log(`q=Chương ${n}: +${gotNew} new | total=${chapters.length} | searches=${searches} | emptyStreak=${consecEmpty}`);
    }
    if (consecEmpty >= MAX_CONSEC_EMPTY) {
      console.log(`Stopping: ${MAX_CONSEC_EMPTY} searches in a row with nothing new (likely have everything reachable).`);
      break;
    }
    await page.waitForTimeout(SEARCH_DELAY);
  }
} finally {
  if (dirty) saveChapters(chapters);
  await browser.close();
}

saveChapters(chapters);
console.log(`Done. added=${added} total=${chapters.length} searches=${searches}`);
