/* ============================================================
   Scrape a public Facebook group for chapter posts.
   Headless Chromium + the saved FB session. Facebook renders
   pasted Google Docs links as plain text / embedded JSON (not
   <a> tags), so we harvest doc ids straight from the page
   source on every scroll step. Resilient by design: no reliance
   on Facebook's churning CSS class names. The chapter number &
   title come from each Doc's own body (see crawl.mjs).
   ============================================================ */
import { chromium } from 'playwright';
import { loadConfig, STATE_PATH, hasSession } from './util.mjs';

// Facebook renders pasted Google Docs links as plain text / embedded JSON
// rather than <a> tags, and often percent- or backslash-escapes the URL.
// Pull every doc id out of the raw page source to catch them all
// (including posts collapsed behind "Xem thêm").
const DOC_ID_RE = /docs\.google\.com(?:\/|%2F|\\\/)document(?:\/|%2F|\\\/)d(?:\/|%2F|\\\/)([a-zA-Z0-9_-]{20,})/gi;

export function extractDocIds(source) {
  const ids = new Set();
  let m;
  DOC_ID_RE.lastIndex = 0;
  while ((m = DOC_ID_RE.exec(source)) !== null) ids.add(m[1]);
  return [...ids];
}

export async function scrapeGroup(config) {
  if (!hasSession()) {
    throw new Error('No saved Facebook session. Run:  node login.mjs');
  }
  if (!config.fbGroupUrl) {
    throw new Error('config.json → "fbGroupUrl" is empty. Set it to the group URL first.');
  }

  const browser = await chromium.launch({ headless: config.headless !== false });
  try {
    const context = await browser.newContext({ storageState: STATE_PATH });
    const page = await context.newPage();
    await page.goto(config.fbGroupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Login wall / expired session detection.
    if (/\/login|\/checkpoint/.test(page.url()) || (await page.locator('input[name="email"]').count()) > 0) {
      throw new Error('Hit a Facebook login wall — the session expired. Run:  node login.mjs');
    }

    // Lazy feed: scroll to pull in more posts, collecting doc ids as we go
    // (older posts unmount from the DOM, so harvest on every scroll step).
    const ids = new Set();
    const harvest = async () => {
      const html = await page.content();
      const text = await page.evaluate(() => document.body.innerText);
      extractDocIds(html).forEach((id) => ids.add(id));
      extractDocIds(text).forEach((id) => ids.add(id));
    };

    await harvest();
    const total = config.maxScrolls || 8;
    for (let i = 0; i < total; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(config.scrollDelayMs || 1500);
      await harvest();
      if (config.progress && (i % 10 === 9 || i === total - 1)) {
        console.log(`  …scroll ${i + 1}/${total} — ${ids.size} doc(s) so far`);
      }
    }

    return [...ids].map((id) => ({
      docUrl: `https://docs.google.com/document/d/${id}/edit`,
      docId: id,
      postText: '',
    }));
  } finally {
    await browser.close();
  }
}

// Run standalone: print what was found.
if (import.meta.url === `file://${process.argv[1]}`) {
  const found = await scrapeGroup(loadConfig());
  console.log(`Found ${found.length} Google Docs link(s):`);
  for (const f of found) console.log(`  • ${f.docId}`);
}
