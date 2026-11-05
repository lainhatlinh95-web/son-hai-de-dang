(function () {
  var m = location.pathname.match(/^(\/truyen\/[^/]+\/chuong\/)(\d+)\/?$/);
  if (!m) { alert('Hãy mở một chương truyện trên Cơm Nguội trước, rồi bấm lại.'); return; }
  if (window.__quietReader) { return; }
  window.__quietReader = 1;

  var base = m[1], cur = Number(m[2]), slug = base.split('/')[2];
  var cache = {}, chain = Promise.resolve(), token = 0;
  var store = {
    get: function (k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var size = Number(store.get('qr:size', '20')), theme = store.get('qr:theme', 'paper');

  var css = ':root{--bg:#f5f1e8;--card:#fffdf8;--ink:#24312c;--mut:#78817b;--line:#e5dfd3;--acc:#26776b}' +
    '.dark{--bg:#171d1b;--card:#202925;--ink:#e9eee9;--mut:#a6b0aa;--line:#35413b;--acc:#79cbbb}' +
    '*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '#top{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border-bottom:1px solid var(--line)}' +
    '#top b{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    'button,a.b{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 12px;text-decoration:none;font-size:14px}' +
    '#wrap{max-width:720px;margin:0 auto;padding:18px 18px 110px}' +
    'h1{font:600 22px/1.3 Georgia,serif;margin:6px 0 18px}' +
    '#txt p{margin:0 0 1.1em;font:var(--s,20px)/1.8 Georgia,"Times New Roman",serif;overflow-wrap:anywhere}' +
    '#msg{color:var(--mut);padding:40px 0;text-align:center;line-height:1.6}' +
    '#nav{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--line)}' +
    '#nav button{flex:1;padding:14px 0;font-size:16px;font-weight:600}#nav #nx{background:var(--acc);color:#fff;border-color:var(--acc)}' +
    '#nav button:disabled{opacity:.4}';

  document.open();
  document.write('<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Đọc sạch</title><style>' + css + '</style></head>' +
    '<body><div id="top"><b id="lbl"></b><button id="sm">A−</button><button id="lg">A+</button><button id="th">◐</button><a class="b" id="src" target="_blank" rel="noopener">Gốc</a></div>' +
    '<div id="wrap"><h1 id="ttl"></h1><div id="txt"></div><div id="msg"></div></div>' +
    '<div id="nav"><button id="pv">← Trước</button><button id="nx">Sau →</button></div></body></html>');
  document.close();

  var $ = function (id) { return document.getElementById(id); };

  function applyLook() {
    document.documentElement.className = theme === 'dark' ? 'dark' : '';
    document.documentElement.style.setProperty('--s', size + 'px');
    store.set('qr:size', String(size));
    store.set('qr:theme', theme);
  }

  function parse(doc) {
    var main = doc && doc.querySelector('main');
    if (!main) { return null; }
    var L = main.innerText.split('\n').map(function (s) { return s.normalize('NFC').trim(); }).filter(Boolean);
    var ti = -1, i;
    for (i = 0; i < L.length; i++) { if (/^Chương\s*\d+/i.test(L[i])) { ti = i; break; } }
    if (ti < 0) { return null; }
    var st = ti + 1;
    while (L[st] === 'Reading settings') { st++; }
    var en = L.length;
    for (i = st; i < L.length; i++) { if (L[i] === 'Reading settings' || L[i] === 'Bình luận') { en = i; break; } }
    var ps = L.slice(st, en);
    return ps.length < 3 ? null : { title: L[ti], ps: ps };
  }

  function fetchChapter(n) {
    return new Promise(function (res, rej) {
      var f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:480px;height:800px;border:0';
      f.src = base + n;
      document.body.appendChild(f);
      var t0 = Date.now();
      (function poll() {
        var r = null;
        try { r = parse(f.contentDocument); } catch (e) {}
        if (r) { f.remove(); res(r); }
        else if (Date.now() - t0 > 25000) { f.remove(); rej(new Error('timeout')); }
        else { setTimeout(poll, 500); }
      })();
    });
  }

  function load(n) {
    if (!cache[n]) {
      cache[n] = chain.then(function () { return fetchChapter(n); });
      chain = cache[n].catch(function () {});
      cache[n].catch(function () { delete cache[n]; });
    }
    return cache[n];
  }

  function show(n, push) {
    var my = ++token;
    cur = n;
    store.set('qr:' + slug, String(n));
    if (push) { history.pushState(null, '', base + n); }
    $('lbl').textContent = 'Chương ' + n;
    $('src').href = base + n;
    $('pv').disabled = n <= 1;
    $('txt').textContent = '';
    $('ttl').textContent = '';
    $('msg').textContent = 'Đang tải chương ' + n + '…';
    window.scrollTo(0, 0);
    load(n).then(function (c) {
      if (my !== token) { return; }
      $('msg').textContent = '';
      $('ttl').textContent = c.title;
      document.title = c.title;
      c.ps.forEach(function (t) { var p = document.createElement('p'); p.textContent = t; $('txt').appendChild(p); });
      load(n + 1).catch(function () {});
    }, function () {
      if (my !== token) { return; }
      $('msg').innerHTML = 'Chưa tải được chương này (chưa có chương, chưa đăng nhập, hoặc đang chờ xác minh).<br><br><button id="rt">Thử lại</button>';
      $('rt').onclick = function () { show(n, false); };
    });
  }

  $('nx').onclick = function () { show(cur + 1, true); };
  $('pv').onclick = function () { if (cur > 1) { show(cur - 1, true); } };
  $('sm').onclick = function () { size = Math.max(16, size - 1); applyLook(); };
  $('lg').onclick = function () { size = Math.min(32, size + 1); applyLook(); };
  $('th').onclick = function () { theme = theme === 'dark' ? 'paper' : 'dark'; applyLook(); };
  window.addEventListener('popstate', function () {
    var mm = location.pathname.match(/\/chuong\/(\d+)/);
    if (mm) { show(Number(mm[1]), false); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { $('nx').click(); }
    if (e.key === 'ArrowLeft') { $('pv').click(); }
  });

  applyLook();
  show(cur, false);
})();
