# Crawler — auto-update chapters from the Facebook group

A daily script that runs **on your Mac**. It opens the public Facebook group with your
saved Facebook session, finds the new chapter **Google Docs links**, downloads each
chapter's text, and writes it into `../data/chapters.json`. It then commits & pushes, so
the public reader on GitHub Pages updates automatically.

Nothing here talks to Facebook's API (a member account can't read a group feed via the
API). It reads the page the same way you would in a browser — so it can break if Facebook
changes its layout. The **manual “Thêm chương”** button in the reader always works as a
fallback.

> Your Facebook session is stored in `.secrets/` and is **never committed** (gitignored).

## One-time setup

```bash
cd crawler
npm install
npx playwright install chromium      # downloads the headless browser

# 1) Log in to Facebook once — a window opens, log in, then press Enter
node login.mjs
```

Then set the group in `config.json`:

```json
{ "fbGroupUrl": "https://www.facebook.com/groups/XXXXXXXXXXXX", "maxScrolls": 8 }
```

Test it:

```bash
node scrape.mjs     # should list the chapter Doc links it sees (incl. the newest)
node crawl.mjs      # fetches new chapters into ../data/chapters.json
```

## Schedule it (daily, automatic)

```bash
cp com.lainhatlinh95.truyenchu-crawl.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.lainhatlinh95.truyenchu-crawl.plist
launchctl start com.lainhatlinh95.truyenchu-crawl   # run once now to verify
```

Runs at 06:00 whenever the Mac is awake. Logs: `.secrets/crawl.log`.
(If the repo isn't at `~/truyen-chu`, edit the paths in the `.plist` first.)

## Files

| File | Role |
|---|---|
| `login.mjs` | One-time interactive Facebook login → saves `.secrets/fb-state.json` |
| `scrape.mjs` | Headless: read the group, return Google Docs links + post text |
| `parse.mjs` | Turn a chapter's plain text into `{num, title, paragraphs}` |
| `crawl.mjs` | Orchestrator: scrape → fetch new Docs → merge into `chapters.json` |
| `run.sh` | Wrapper for the scheduler: crawl, then `git commit && push` |
| `config.json` | Group URL + scroll settings |
| `com.…plist` | macOS LaunchAgent (daily schedule) |

## Troubleshooting

- **“Hit a Facebook login wall / session expired”** → re-run `node login.mjs`.
- **`scrape.mjs` finds 0 links** → increase `maxScrolls`, or Facebook changed its markup
  (use the manual add in the reader meanwhile).
- **`node` not found under launchd** → `run.sh` already sources nvm; make sure nvm is at
  `~/.nvm`.
