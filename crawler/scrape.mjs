/* ============================================================
   Scrape a public Facebook group for chapter posts.
   Headless Chromium + the saved FB session. Collects every
   Google Docs link in the feed together with the text of the
   post it sits in, so the crawler can read the "Chương N: …"
   title. Resilient by design: it queries anchors + text, never
   Facebook's churning CSS class names.
   ============================================================ */
import { chromium } from 'playwright';
import { loadConfig, STATE_PATH, hasSession } from './util.mjs';
import { docId } from './parse.mjs';

// Facebook wraps outbound links as l.facebook.com/l.php?u=<encoded>.
function unwrapFbLink(href) {
  try {
    const u = new URL(href);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname.includes('/l.php')) {
      const target = u.searchParams.get('u');
      if (target) return decodeURIComponent(target);
    }
  } catch { /* not a URL we can parse */ }
  return href;
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

    // Lazy feed: scroll to pull in more posts.
    for (let i = 0; i < (config.maxScrolls || 8); i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(config.scrollDelayMs || 1500);
    }

    const raw = await page.evaluate(() => {
      const out = [];
      const anchors = document.querySelectorAll('a[href*="docs.google.com/document"], a[href*="l.php"][href*="docs.google.com"], a[href*="l.php"][href*="document"]');
      anchors.forEach((a) => {
        // climb to the enclosing post (role=article), else a sizeable ancestor.
        let post = a.closest('[role="article"]');
        if (!post) {
          let n = a;
          for (let i = 0; i < 8 && n.parentElement; i++) {
            n = n.parentElement;
            if (n.innerText && n.innerText.length > 80) { post = n; break; }
          }
        }
        out.push({ href: a.href, postText: (post?.innerText || a.innerText || '').slice(0, 600) });
      });
      return out;
    });

    // Dedupe by docId, keep the richest post text.
    const byId = new Map();
    for (const r of raw) {
      const url = unwrapFbLink(r.href);
      const id = docId(url);
      if (!id || !url.includes('docs.google.com')) continue;
      const prev = byId.get(id);
      if (!prev || (r.postText || '').length > (prev.postText || '').length) {
        byId.set(id, { docUrl: `https://docs.google.com/document/d/${id}/edit`, docId: id, postText: r.postText });
      }
    }
    return [...byId.values()];
  } finally {
    await browser.close();
  }
}

// Run standalone: print what was found.
if (import.meta.url === `file://${process.argv[1]}`) {
  const found = await scrapeGroup(loadConfig());
  console.log(`Found ${found.length} chapter link(s):`);
  for (const f of found) {
    const firstLine = (f.postText || '').split('\n').find((l) => l.trim()) || '(no text)';
    console.log(`  • ${f.docId}  —  ${firstLine.slice(0, 80)}`);
  }
}
