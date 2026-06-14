/* ============================================================
   parseChapter — Node port of the browser parser in app.js
   (app.js:284 `parseChapter`). Kept in sync manually; the
   browser copy still powers the manual paste/link fallback.

   Pure function: no DOM, no Date.now(). Returns
   { num, title, paragraphs } or null when the text is unusable.
   ============================================================ */

const CHAP_RE = /Chương\s*0*(\d+)\s*[:：.\-]?\s*(.*)$/i;

// Extract "Chương N: title" from an arbitrary string (e.g. a FB post).
export function parseHeading(s) {
  const m = String(s || '').match(CHAP_RE);
  if (!m) return null;
  return { num: parseInt(m[1], 10), title: (m[2] || '').trim() };
}

export function parseChapter(text, opts = {}) {
  const { sourceUrl = '', fallbackNum = null, postTitle = '' } = opts;

  text = String(text || '').replace(/^﻿/, '').replace(/\r/g, '');

  // strip a leading mobilebasic/frontmatter block (--- ... ---)
  if (/^\s*---/.test(text)) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      const after = text.indexOf('\n', end + 1);
      if (after !== -1) text = text.slice(after + 1);
    }
  }

  let paras = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (!paras.length) return null;

  let num = null;
  let title = '';

  // Prefer the title/number the FB post already gave us.
  const fromPost = parseHeading(postTitle);
  if (fromPost) {
    num = fromPost.num;
    title = fromPost.title;
  }

  // Title/number from the doc body (first non-empty line, then first 3).
  const m = paras[0].match(CHAP_RE);
  if (m) {
    if (num == null) num = parseInt(m[1], 10);
    if (!title) title = (m[2] || '').trim();
    paras = paras.slice(1);
  } else {
    for (let i = 0; i < Math.min(3, paras.length); i++) {
      const mm = paras[i].match(CHAP_RE);
      if (mm) {
        if (num == null) num = parseInt(mm[1], 10);
        if (!title) title = (mm[2] || '').trim();
        paras.splice(i, 1);
        break;
      }
    }
  }

  // drop a leading duplicate title line
  if (title && paras.length && paras[0].toLowerCase() === title.toLowerCase()) paras.shift();
  if (!title && paras.length) title = paras[0].slice(0, 60);

  if (num == null) {
    const um = String(sourceUrl).match(/chương[-_ ]?(\d+)/i);
    if (um) num = parseInt(um[1], 10);
    else if (fallbackNum != null) num = fallbackNum;
  }
  if (num == null || !paras.length) return null;

  return { num, title, paragraphs: paras };
}

// Pull the Google Docs id out of any docs URL.
export function docId(url) {
  let m = String(url || '').match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
