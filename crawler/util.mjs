import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const CRAWLER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(CRAWLER_DIR, '..');
export const SECRETS_DIR = path.join(CRAWLER_DIR, '.secrets');
export const STATE_PATH = path.join(SECRETS_DIR, 'fb-state.json');
export const CHAPTERS_PATH = path.join(REPO_ROOT, 'data', 'chapters.json');

export function loadConfig() {
  const raw = JSON.parse(fs.readFileSync(path.join(CRAWLER_DIR, 'config.json'), 'utf8'));
  const cfg = { fbGroupUrl: '', maxScrolls: 8, scrollDelayMs: 1500, headless: true, ...raw };
  // env overrides (used for one-off deep backfills without touching config.json)
  if (process.env.CRAWL_MAX_SCROLLS) cfg.maxScrolls = parseInt(process.env.CRAWL_MAX_SCROLLS, 10);
  if (process.env.CRAWL_GROUP_URL) cfg.fbGroupUrl = process.env.CRAWL_GROUP_URL;
  return cfg;
}

export function loadChapters() {
  try {
    const arr = JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveChapters(chapters) {
  chapters.sort((a, b) => a.num - b.num);
  fs.mkdirSync(path.dirname(CHAPTERS_PATH), { recursive: true });
  fs.writeFileSync(CHAPTERS_PATH, JSON.stringify(chapters, null, 2) + '\n');
}

export function ensureSecretsDir() {
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
}

export function hasSession() {
  return fs.existsSync(STATE_PATH);
}
