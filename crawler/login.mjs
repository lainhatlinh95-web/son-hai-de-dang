/* ============================================================
   One-time interactive Facebook login.
   Opens a real browser window — log in to Facebook by hand,
   then come back to this terminal and press Enter. The session
   is saved to crawler/.secrets/fb-state.json and reused by the
   daily crawl. Re-run this whenever the crawl reports the
   session expired.
   ============================================================ */
import { chromium } from 'playwright';
import readline from 'node:readline';
import { ensureSecretsDir, STATE_PATH } from './util.mjs';

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });

console.log('\n→ A browser window opened. Log in to Facebook there.');
console.log('  When you can see your normal Facebook feed, come back here.');
await waitForEnter('  Press Enter once you are logged in… ');

ensureSecretsDir();
await context.storageState({ path: STATE_PATH });
await browser.close();
console.log(`\n✓ Session saved to ${STATE_PATH}`);
console.log('  You can now run:  node crawl.mjs');
