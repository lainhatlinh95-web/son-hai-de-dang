/* ============================================================
   Sơn Hải — truyện chữ reader
   Vanilla JS. State persisted to localStorage.
   ============================================================ */
(function () {
  'use strict';

  var LS_CHAPTERS = 'tc_chapters_v1';
  var LS_STATE = 'tc_state_v1';
  var LS_SETTINGS = 'tc_settings_v1';
  var LS_REMOVED = 'tc_removed_v1';   // chapter nums the user deleted (so the daily crawl won't re-add them)
  var CHAPTERS_URL = 'data/chapters.json';

  /* ---------- storage helpers ---------- */
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  function normalizeChapter(c) {
    return { num: c.num, title: c.title, paragraphs: (c.paragraphs || []).slice(),
             sourceUrl: c.sourceUrl || '', addedAt: c.addedAt || Date.now() };
  }

  /* ---------- state ---------- */
  // The working library lives in localStorage; new chapters from the daily crawl
  // (data/chapters.json) and manual adds are merged into it. seed.js is the
  // offline fallback when the file can't be fetched (e.g. opened via file://).
  var chapters = load(LS_CHAPTERS, null);
  if (!chapters || !chapters.length) {
    chapters = (window.SEED_CHAPTERS || []).map(normalizeChapter);
    if (chapters.length) save(LS_CHAPTERS, chapters);
  }
  var removed = load(LS_REMOVED, []);   // nums the user deleted

  // Merge crawled/seed chapters into the library, skipping ones the user removed.
  function mergeIncoming(list) {
    var have = {};
    chapters.forEach(function (c) { have[c.num] = true; });
    var gone = {};
    removed.forEach(function (n) { gone[n] = true; });
    var added = 0;
    (list || []).forEach(function (c) {
      if (c == null || c.num == null) return;
      if (have[c.num] || gone[c.num]) return;
      chapters.push(normalizeChapter(c));
      have[c.num] = true;
      added++;
    });
    if (added) { save(LS_CHAPTERS, chapters); renderLibrary(); }
    return added;
  }

  // Pull the crawler's committed chapters; fall back to the bundled seed offline.
  function syncCrawled() {
    fetch(CHAPTERS_URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (list) { mergeIncoming(list); })
      .catch(function () { mergeIncoming(window.SEED_CHAPTERS || []); });
  }
  var state = load(LS_STATE, { lastNum: null, pos: {}, read: {} });
  if (!state.pos) state.pos = {};
  if (!state.read) state.read = {};
  var settings = load(LS_SETTINGS, { theme: 'sepia', font: 'lora', fs: 20, lh: 1.85 });

  var current = null;       // current chapter num while reading
  var saveTimer = null;
  var chapterQuery = '';

  /* ---------- dom ---------- */
  var $ = function (s) { return document.querySelector(s); };
  var body = document.body;
  var libView = $('#libView'), readView = $('#readView');

  /* ============================================================
     SETTINGS
     ============================================================ */
  function applySettings() {
    body.setAttribute('data-theme', settings.theme);
    body.setAttribute('data-font', settings.font);
    var readFont = settings.font === 'sans' ? "'Be Vietnam Pro',sans-serif"
                 : settings.font === 'noto' ? "'Noto Serif',serif"
                 : "'Lora',Georgia,serif";
    document.documentElement.style.setProperty('--read', readFont);
    document.documentElement.style.setProperty('--fs', settings.fs + 'px');
    document.documentElement.style.setProperty('--lh', settings.lh);
    // reflect controls
    $('#fsVal').textContent = settings.fs;
    $('#lhVal').textContent = settings.lh.toFixed(2);
    document.querySelectorAll('#themeSel button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.themeVal === settings.theme);
    });
    document.querySelectorAll('#fontSel button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.fontVal === settings.font);
    });
  }
  function persistSettings() { save(LS_SETTINGS, settings); applySettings(); }

  $('#themeSel').addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-val]'); if (!b) return;
    settings.theme = b.dataset.themeVal; persistSettings();
  });
  $('#fontSel').addEventListener('click', function (e) {
    var b = e.target.closest('[data-font-val]'); if (!b) return;
    settings.font = b.dataset.fontVal; persistSettings();
  });
  $('#fsUp').onclick = function () { settings.fs = Math.min(30, settings.fs + 1); persistSettings(); };
  $('#fsDown').onclick = function () { settings.fs = Math.max(15, settings.fs - 1); persistSettings(); };
  $('#lhUp').onclick = function () { settings.lh = Math.min(2.4, +(settings.lh + 0.1).toFixed(2)); persistSettings(); };
  $('#lhDown').onclick = function () { settings.lh = Math.max(1.3, +(settings.lh - 0.1).toFixed(2)); persistSettings(); };

  /* ============================================================
     SHEETS
     ============================================================ */
  var scrim = $('#scrim');
  function openSheet(id) {
    scrim.classList.add('open');
    $(id).classList.add('open');
  }
  function closeSheets() {
    scrim.classList.remove('open');
    document.querySelectorAll('.sheet').forEach(function (s) { s.classList.remove('open'); });
  }
  scrim.addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheets); });
  $('#setBtn').onclick = function () { openSheet('#setSheet'); };
  $('#rSetBtn').onclick = function () { openSheet('#setSheet'); };
  $('#addBtn').onclick = function () { renderManage(); openSheet('#addSheet'); };
  $('#chapSearch').addEventListener('input', function (e) {
    chapterQuery = e.target.value.replace(/\D/g, '');
    if (e.target.value !== chapterQuery) e.target.value = chapterQuery;
    renderLibrary();
  });

  /* ============================================================
     LIBRARY
     ============================================================ */
  function sortChaps() { chapters.sort(function (a, b) { return a.num - b.num; }); }

  function progressOf(num) {
    var p = state.pos[num];
    if (state.read[num]) return 100;
    return p ? Math.round(p * 100) : 0;
  }

  function renderLibrary() {
    sortChaps();
    var nums = chapters.map(function (c) { return c.num; });
    var min = nums.length ? Math.min.apply(null, nums) : 0;
    var max = nums.length ? Math.max.apply(null, nums) : 0;
    $('#libSub').textContent = chapters.length
      ? chapters.length + ' chương · ' + (min === max ? ('Chương ' + min) : ('Chương ' + min + '–' + max))
      : 'Chưa có chương nào';
    var visibleChapters = chapters.slice().reverse();
    if (chapterQuery) {
      var wanted = parseInt(chapterQuery, 10);
      visibleChapters = visibleChapters.filter(function (c) { return c.num === wanted; });
    }
    $('#chapCount').textContent = chapterQuery
      ? visibleChapters.length + '/' + chapters.length + ' chương'
      : (chapters.length ? chapters.length + ' chương' : '');

    // continue card
    var cc = $('#continueCard');
    var lastNum = state.lastNum != null && findChap(state.lastNum) ? state.lastNum
                : (chapters.length ? chapters[0].num : null);
    if (lastNum != null) {
      var ch = findChap(lastNum);
      cc.style.display = '';
      $('#cNum').textContent = ch.num;
      $('#cTitle').textContent = ch.title || ('Chương ' + ch.num);
      var pct = progressOf(ch.num);
      $('#cBar').style.width = pct + '%';
      $('#cPct').textContent = pct >= 100 ? 'Đã đọc xong' : (pct > 0 ? 'Đã đọc ' + pct + '%' : 'Bắt đầu đọc');
      cc.onclick = function () { openChapter(ch.num, true); };
    } else {
      cc.style.display = 'none';
    }

    // list
    var list = $('#chapList');
    if (!visibleChapters.length) {
      list.innerHTML = chapters.length
        ? '<div class="empty">Không tìm thấy Chương ' + esc(chapterQuery) + '.</div>'
        : '<div class="empty">Chưa có chương nào.<br>Bấm <b>Thêm chương</b> để dán link Google Docs.</div>';
      return;
    }
    list.innerHTML = '';
    visibleChapters.forEach(function (c) {
      var pct = progressOf(c.num);
      var done = pct >= 100;
      var started = pct > 0 && !done;
      var el = document.createElement('button');
      el.className = 'chap';
      el.innerHTML =
        '<div class="chap-num">' + c.num + '</div>' +
        '<div class="chap-main"><div class="t">' + esc(c.title || ('Chương ' + c.num)) + '</div>' +
        '<div class="chap-meta">' +
          '<span class="dot ' + (done ? 'done' : '') + '"></span>' +
          (done ? 'Đã đọc' : started ? ('Đang đọc · ' + pct + '%') : 'Chưa đọc') +
        '</div></div>' +
        '<div class="chap-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></div>';
      el.onclick = function () { openChapter(c.num, false); };
      list.appendChild(el);
    });
  }

  function findChap(num) {
    for (var i = 0; i < chapters.length; i++) if (chapters[i].num === num) return chapters[i];
    return null;
  }
  function chapIndex(num) {
    for (var i = 0; i < chapters.length; i++) if (chapters[i].num === num) return i;
    return -1;
  }

  /* ============================================================
     READER
     ============================================================ */
  function openChapter(num, restorePos) {
    var ch = findChap(num); if (!ch) return;
    closeSheets();
    current = num;
    state.lastNum = num;
    save(LS_STATE, state);

    $('#rTopTitle').textContent = 'Chương ' + ch.num;
    var html =
      '<div class="r-chaphead">' +
        '<div class="seal"><small>Chương</small><b>' + ch.num + '</b></div>' +
        '<h1>' + esc(ch.title || '') + '</h1>' +
        '<div class="rule"></div>' +
      '</div>' +
      '<div class="r-body">' +
        ch.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '</div>' +
      '<div class="r-end"><div class="glyph">❖</div></div>';

    var idx = chapIndex(num);
    var hasNext = idx >= 0 && idx < chapters.length - 1;
    html += '<button class="r-nextbtn" id="endNext"' + (hasNext ? '' : ' disabled') + '>' +
      (hasNext ? 'Chương tiếp theo →' : 'Đây là chương mới nhất') + '</button>';

    $('#rContent').innerHTML = html;

    var endNext = $('#endNext');
    if (endNext && hasNext) endNext.onclick = function () { goRel(1); };

    // nav buttons
    $('#prevBtn').disabled = idx <= 0;
    $('#nextBtn').disabled = !hasNext;

    // switch view
    libView.classList.remove('active');
    readView.classList.add('active');
    body.classList.remove('immersive');

    // restore scroll
    requestAnimationFrame(function () {
      var pos = restorePos ? (state.pos[num] || 0) : 0;
      var target = pos * maxScroll();
      window.scrollTo(0, target);
      updateProgress();
    });
  }

  function maxScroll() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function updateProgress() {
    if (current == null) return;
    var ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll()));
    $('#rProg').style.width = (ratio * 100) + '%';
    state.pos[current] = ratio;
    if (ratio >= 0.92) state.read[current] = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { save(LS_STATE, state); }, 300);
  }

  function goRel(dir) {
    var idx = chapIndex(current);
    var n = idx + dir;
    if (n < 0 || n >= chapters.length) return;
    openChapter(chapters[n].num, false);
  }

  function backToLib() {
    save(LS_STATE, state);
    readView.classList.remove('active');
    libView.classList.add('active');
    current = null;
    body.classList.remove('immersive');
    renderLibrary();
  }

  $('#backBtn').onclick = backToLib;
  $('#prevBtn').onclick = function () { goRel(-1); };
  $('#nextBtn').onclick = function () { goRel(1); };
  $('#listBtn').onclick = backToLib;
  $('#fontBtn').onclick = function () { openSheet('#setSheet'); };

  // scroll tracking (reader view only)
  window.addEventListener('scroll', function () {
    if (readView.classList.contains('active')) updateProgress();
  }, { passive: true });

  // tap center → toggle immersive chrome
  $('#rContent').addEventListener('click', function (e) {
    if (e.target.closest('button')) return;
    var h = window.innerHeight, y = e.clientY;
    if (y > h * 0.28 && y < h * 0.72) body.classList.toggle('immersive');
  });

  /* ============================================================
     ADD CHAPTERS — tabs
     ============================================================ */
  $('#addTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    document.querySelectorAll('#addTabs button').forEach(function (x) { x.classList.remove('on'); });
    b.classList.add('on');
    var t = b.dataset.tab;
    $('#tabUrl').style.display = t === 'url' ? '' : 'none';
    $('#tabPaste').style.display = t === 'paste' ? '' : 'none';
  });

  function setStatus(el, cls, html) {
    el.className = 'status show ' + cls;
    el.innerHTML = html;
  }

  /* ----- parse plain text into chapter ----- */
  function parseChapter(text, sourceUrl) {
    // strip mobilebasic frontmatter (--- ... ---)
    text = text.replace(/\r/g, '');
    if (/^\s*---/.test(text)) {
      var end = text.indexOf('\n---', 3);
      if (end !== -1) {
        var after = text.indexOf('\n', end + 1);
        if (after !== -1) text = text.slice(after + 1);
      }
    }
    var lines = text.split('\n').map(function (l) { return l.trim(); });
    // collapse to paragraphs (non-empty lines)
    var paras = lines.filter(function (l) { return l.length > 0; });
    if (!paras.length) return null;

    // title detection
    var num = null, title = '';
    var first = paras[0];
    var m = first.match(/Ch\u01b0\u01a1ng\s*0*(\d+)\s*[:：.\-]?\s*(.*)$/i);
    if (m) {
      num = parseInt(m[1], 10);
      title = (m[2] || '').trim();
      paras = paras.slice(1);
      // sometimes title repeats as next line
    } else {
      // try to find any "Chương N" in first 3 lines
      for (var i = 0; i < Math.min(3, paras.length); i++) {
        var mm = paras[i].match(/Ch\u01b0\u01a1ng\s*0*(\d+)\s*[:：.\-]?\s*(.*)$/i);
        if (mm) { num = parseInt(mm[1], 10); title = (mm[2] || '').trim(); paras.splice(i, 1); break; }
      }
    }
    // drop a leading duplicate title line if it equals title
    if (title && paras.length && paras[0].toLowerCase() === title.toLowerCase()) paras.shift();
    if (!title && paras.length) { title = paras[0].slice(0, 60); }
    if (num == null) {
      // fallback: next available number after max, or from URL
      var um = (sourceUrl || '').match(/ch\u01b0\u01a1ng[-_ ]?(\d+)/i);
      if (um) num = parseInt(um[1], 10);
      else num = (chapters.length ? Math.max.apply(null, chapters.map(function (c) { return c.num; })) : 0) + 1;
    }
    return { num: num, title: title, paragraphs: paras, sourceUrl: sourceUrl || '', addedAt: Date.now() };
  }

  function upsertChapter(ch) {
    var i = chapIndex(ch.num);
    if (i >= 0) chapters[i] = ch; else chapters.push(ch);
    sortChaps();
    save(LS_CHAPTERS, chapters);
    var ri = removed.indexOf(ch.num);   // re-adding clears any prior deletion
    if (ri !== -1) { removed.splice(ri, 1); save(LS_REMOVED, removed); }
  }

  /* ----- Google Docs URL → text via CORS relays ----- */
  function docId(url) {
    var m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }
  function targetUrls(url) {
    var id = docId(url);
    var list = [];
    if (id) {
      list.push('https://docs.google.com/document/d/' + id + '/export?format=txt');
      list.push('https://docs.google.com/document/d/' + id + '/mobilebasic');
    } else {
      list.push(url);
    }
    return list;
  }
  function relays(u) {
    var e = encodeURIComponent(u);
    return [
      'https://api.allorigins.win/raw?url=' + e,
      'https://corsproxy.io/?url=' + e,
      'https://thingproxy.freeboard.io/fetch/' + u
    ];
  }
  function fetchText(url) {
    // try each target through each relay until one returns usable text
    var targets = targetUrls(url);
    var attempts = [];
    targets.forEach(function (t) { relays(t).forEach(function (r) { attempts.push(r); }); });

    return new Promise(function (resolve, reject) {
      var i = 0;
      function tryNext() {
        if (i >= attempts.length) { reject(new Error('all-failed')); return; }
        var a = attempts[i++];
        fetch(a, { method: 'GET' })
          .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
          .then(function (txt) {
            // strip HTML if mobilebasic came back as html
            if (/<html|<!doctype/i.test(txt)) txt = htmlToText(txt);
            if (txt && txt.replace(/\s/g, '').length > 40) resolve(txt);
            else tryNext();
          })
          .catch(function () { tryNext(); });
      }
      tryNext();
    });
  }
  function htmlToText(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,head').forEach(function (n) { n.remove(); });
    // google mobilebasic wraps content in body; use innerText-ish
    var body = doc.body || doc.documentElement;
    // turn block elements into newlines
    body.querySelectorAll('p,div,br,h1,h2,h3').forEach(function (n) { n.insertAdjacentText('beforebegin', '\n'); });
    return (body.textContent || '').replace(/\n{3,}/g, '\n\n');
  }

  /* ----- fetch button ----- */
  $('#fetchBtn').onclick = function () {
    var raw = $('#urlInput').value.trim();
    if (!raw) { setStatus($('#urlStatus'), 'err', 'Hãy dán ít nhất một link Google Docs.'); return; }
    var urls = raw.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var btn = $('#fetchBtn'); btn.disabled = true;
    var ok = 0, fail = 0, failedUrls = [];
    var st = $('#urlStatus');

    function step(idx) {
      if (idx >= urls.length) {
        btn.disabled = false;
        var msg = '<b>Xong:</b> ' + ok + ' chương đã lưu.';
        if (fail) msg += '<br>' + fail + ' link không tải được — Google có thể chặn. Hãy thử tab <b>Dán văn bản</b> cho các link đó.';
        setStatus(st, fail ? (ok ? 'ok' : 'err') : 'ok', msg);
        if (ok) { $('#urlInput').value = failedUrls.join('\n'); renderManage(); renderLibrary(); }
        return;
      }
      setStatus(st, 'work', '<span class="spin"></span>Đang tải link ' + (idx + 1) + '/' + urls.length + '…');
      fetchText(urls[idx])
        .then(function (txt) {
          var ch = parseChapter(txt, urls[idx]);
          if (ch && ch.paragraphs.length) { upsertChapter(ch); ok++; }
          else { fail++; failedUrls.push(urls[idx]); }
        })
        .catch(function () { fail++; failedUrls.push(urls[idx]); })
        .finally(function () { step(idx + 1); });
    }
    step(0);
  };

  /* ----- paste save ----- */
  $('#savePaste').onclick = function () {
    var txt = $('#pasteInput').value.trim();
    var st = $('#pasteStatus');
    if (txt.replace(/\s/g, '').length < 40) { setStatus(st, 'err', 'Nội dung quá ngắn. Hãy dán toàn bộ chương.'); return; }
    var ch = parseChapter(txt, '');
    if (!ch || !ch.paragraphs.length) { setStatus(st, 'err', 'Không đọc được nội dung.'); return; }
    upsertChapter(ch);
    setStatus(st, 'ok', '<b>Đã lưu:</b> Chương ' + ch.num + (ch.title ? ' — ' + esc(ch.title) : '') + '.');
    $('#pasteInput').value = '';
    renderManage(); renderLibrary();
  };

  /* ----- manage list (delete) ----- */
  function renderManage() {
    sortChaps();
    $('#mCount').textContent = chapters.length + ' chương';
    var ml = $('#manageList');
    if (!chapters.length) { ml.innerHTML = '<div class="empty" style="padding:20px">Chưa có chương nào.</div>'; return; }
    ml.innerHTML = '';
    chapters.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'mrow';
      row.innerHTML = '<div class="mn">' + c.num + '</div><div class="mt">' + esc(c.title || ('Chương ' + c.num)) + '</div>' +
        '<button class="del" title="Xóa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg></button>';
      row.querySelector('.del').onclick = function () {
        if (!confirm('Xóa Chương ' + c.num + '?')) return;
        chapters = chapters.filter(function (x) { return x.num !== c.num; });
        save(LS_CHAPTERS, chapters);
        if (removed.indexOf(c.num) === -1) { removed.push(c.num); save(LS_REMOVED, removed); }
        renderManage(); renderLibrary();
      };
      ml.appendChild(row);
    });
  }

  /* ---------- util ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- keyboard (desktop convenience) ---------- */
  document.addEventListener('keydown', function (e) {
    if (!readView.classList.contains('active')) return;
    if (e.key === 'ArrowRight') goRel(1);
    else if (e.key === 'ArrowLeft') goRel(-1);
    else if (e.key === 'Escape') backToLib();
  });

  /* ---------- boot ---------- */
  applySettings();
  renderLibrary();
  syncCrawled();   // pull any chapters added by the daily crawl
})();
