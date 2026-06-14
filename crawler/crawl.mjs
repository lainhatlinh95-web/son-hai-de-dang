/* ============================================================
   Daily crawl orchestrator.
     1. scrape the FB group for chapter Google Docs links
     2. for each link not already stored, fetch the public Doc
        as plain text and parse it into a chapter
     3. merge into data/chapters.json (dedupe by docId & num)
   Idempotent: a run with no new posts changes nothing.
   ============================================================ */
import { loadConfig, loadChapters, saveChapters } from './util.mjs';
import { scrapeGroup } from './scrape.mjs';
import { parseChapter, parseHeading } from './parse.mjs';

function docExportUrl(id) {
  return `https://docs.google.com/document/d/${id}/export?format=txt`;
}

async function fetchDocText(id) {
  const res = await fetch(docExportUrl(id), { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  if (!txt || txt.replace(/\s/g, '').length < 40) throw new Error('empty/too short');
  return txt;
}

// pull the "Chương N: title" line out of the post text, if any
function postHeadingLine(postText) {
  for (const line of String(postText || '').split('\n')) {
    if (parseHeading(line)) return line.trim();
  }
  return '';
}

async function main() {
  const config = loadConfig();
  const chapters = loadChapters();
  const seenDocIds = new Set(chapters.map((c) => c.docId).filter(Boolean));
  const seenNums = new Set(chapters.map((c) => c.num));

  console.log('Scraping group…');
  const found = await scrapeGroup(config);
  console.log(`Found ${found.length} chapter link(s) in the feed.`);

  let added = 0, skipped = 0, failed = 0;
  for (const f of found) {
    if (seenDocIds.has(f.docId)) { skipped++; continue; }
    try {
      const text = await fetchDocText(f.docId);
      const ch = parseChapter(text, {
        sourceUrl: f.docUrl,
        postTitle: postHeadingLine(f.postText),
      });
      if (!ch) { failed++; console.warn(`  ! could not parse ${f.docId}`); continue; }
      if (seenNums.has(ch.num)) { skipped++; continue; }

      chapters.push({
        num: ch.num,
        title: ch.title,
        paragraphs: ch.paragraphs,
        sourceUrl: f.docUrl,
        docId: f.docId,
        addedAt: Date.now(),
      });
      seenDocIds.add(f.docId);
      seenNums.add(ch.num);
      added++;
      console.log(`  + Chương ${ch.num}: ${ch.title}`);
    } catch (e) {
      failed++;
      console.warn(`  ! ${f.docId} failed: ${e.message}`);
    }
  }

  if (added > 0) saveChapters(chapters);
  console.log(`Done. added=${added} skipped=${skipped} failed=${failed} total=${chapters.length}`);
  // exit code 0 always (a no-op day is success); scrape() throws on session loss.
}

main().catch((e) => {
  console.error('CRAWL ERROR:', e.message);
  process.exit(1);
});
