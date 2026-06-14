/* ============================================================
   One-time interactive Facebook login.
   Opens a real browser window — log in to Facebook by hand.
   The script watches for your logged-in session cookie and
   saves it automatically to crawler/.secrets/fb-state.json,
   then closes. Re-run this whenever the crawl reports the
   session expired.
   ============================================================ */
import { chromium } from 'playwright';
import { ensureSecretsDir, STATE_PATH } from './util.mjs';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to finish logging in

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });

console.log('\n→ A browser window opened. Log in to Facebook there.');
console.log('  I will detect it automatically and save the session — no need to come back here.\n');

const start = Date.now();
let saved = false;
while (Date.now() - start < TIMEOUT_MS) {
  const cookies = await context.cookies('https://www.facebook.com');
  const loggedIn = cookies.some((c) => c.name === 'c_user' && c.value);
  if (loggedIn) {
    // small settle so all auth cookies are written
    await page.waitForTimeout(2000);
    ensureSecretsDir();
    await context.storageState({ path: STATE_PATH });
    saved = true;
    break;
  }
  await page.waitForTimeout(2000);
}

await browser.close();
if (saved) {
  console.log(`✓ Logged in — session saved to ${STATE_PATH}`);
  console.log('  Next:  node crawl.mjs');
  process.exit(0);
} else {
  console.error('✗ Timed out waiting for login. Run `node login.mjs` again.');
  process.exit(1);
}
