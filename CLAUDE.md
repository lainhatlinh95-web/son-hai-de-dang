# CLAUDE.md — agent runbook for the Sơn Hải Đề Đăng reader

Web reader for the Vietnamese web novel **Sơn Hải Đề Đăng** (tác giả Dược Thiên Sầu).
A static site plus a Facebook-group scraper that keeps it updated with new chapters.
This file tells an agent on a fresh clone how to update chapters on any machine.

## What it is
- **Live site:** https://truyen-chu-nine.vercel.app — Vercel, **auto-deploys on every push to `main`**.
- **Repo:** `lainhatlinh95-web/son-hai-de-dang` (public). GitHub CLI account: `lainhatlinh95-web`.
- Reader is plain HTML/CSS/JS — **no build step**.

## File map
| Path | Role |
|---|---|
| `index.html` | the reader (entry point) |
| `Đọc Truyện.html` | redirect → `index.html` (original design filename) |
| `app.js` | reader logic; on load fetches `data/chapters.json`, merges into `localStorage` |
| `data/chapters.json` | **chapter list — the crawler writes this, the app reads it** |
| `data/seed.js` | offline fallback (chapter 868) when `chapters.json` can't be fetched |
| `vercel.json`, `.vercelignore` | static deploy config |
| `crawler/` | Facebook scraper (Node + Playwright) — see below |

## How chapters flow
Public FB group → each post contains a **Google Docs link** → crawler extracts the link →
fetches the Doc as plain text (`https://docs.google.com/document/d/<id>/export?format=txt`,
no auth) → parses `Chương N: title` + paragraphs → merges into `data/chapters.json` →
commit + push → Vercel redeploys → reader shows it.

## crawler/ scripts
- `login.mjs` — one-time **interactive** FB login; saves `.secrets/fb-state.json`
- `crawl.mjs` — daily: scrape the recent feed, add any new chapters
- `scrape.mjs`, `parse.mjs` — helpers (harvest doc ids from page source; parse a chapter)
- `backfill.mjs` / `backfill-scroll.mjs` — one-time history backfill (by search / by chronological scroll)
- `crawl-khotruyenchu.mjs` — one-off backfill from `khotruyenchu.fun` (no FB/login needed); pulls any
  chapter missing locally. Used to fill 1–770. Plain `fetch` + HTML parse: `node crawl-khotruyenchu.mjs [--dry] [--max N]`
- `run.sh` — crawl + `git commit` + `git push` (used by the scheduler)
- `config.json` — `{ fbGroupUrl, maxScrolls, ... }` (group URL already set)
- `com.lainhatlinh95.truyenchu-crawl.plist` — macOS LaunchAgent (runs at login + 6am)

## ⚠️ Secrets are per-machine (not in the repo)
`crawler/.secrets/` (the saved Facebook session) is **gitignored** — it is NOT cloned.
On every new machine a human must run `node login.mjs` once and log into Facebook in the
browser window that opens. An agent can launch it, but only a human can complete the login.

## Setup on a fresh clone (any machine)
```bash
# load nvm so node/npm exist
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd crawler
npm install
npx playwright install chromium
node login.mjs        # browser opens → log into Facebook → session auto-saved
node crawl.mjs        # fetch any new chapters into ../data/chapters.json
```

## ⭐ To auto-update new chapters (what to ask an agent)
Ask: **"Update the reader with the latest chapters."** The agent should run, from the repo root:
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd crawler
[ -f .secrets/fb-state.json ] || node login.mjs     # log in if there's no session yet
node crawl.mjs
cd ..
git diff --quiet data/chapters.json || { git add data/chapters.json && \
  git commit -m "chore: new chapters from crawl" && git push origin main; }
```
Pushing to `main` triggers the Vercel redeploy automatically — nothing else needed.

## Daily automation (optional)
- **macOS:** `mkdir -p ~/Library/LaunchAgents && cp crawler/com.lainhatlinh95.truyenchu-crawl.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.lainhatlinh95.truyenchu-crawl.plist`
  (runs at login + 6am; edit the paths in the plist if the local checkout isn't at `~/truyen-chu`).
- **Linux/other:** add a cron job that runs `crawler/run.sh`.

## Known limits (don't re-investigate — these are confirmed)
- **Facebook only serves ~the latest 100 posts** of the group. Both feed-scroll AND search
  dead-end around chapter 771, so the FB crawler can't reach 1–770. Those were backfilled
  from `khotruyenchu.fun` via `crawl-khotruyenchu.mjs` (re-run it to fill any future gaps).
- **Current coverage:** chapters **1–875** (only gap: 726, which the source also lacks).
- **FB session expires** after a few weeks → `crawl.mjs` logs a "login wall" and finds nothing →
  re-run `node login.mjs`. Crawl log: `crawler/.secrets/crawl.log`.
- **Reading progress is per-browser** (`localStorage` keys `tc_*`) — not synced across devices.
- Manual fallback: the reader's **Thêm chương** button adds a chapter by Google Docs link or pasted text.
