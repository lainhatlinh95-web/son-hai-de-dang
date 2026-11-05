// ==UserScript==
// @name         Đọc sạch – Cơm Nguội
// @namespace    https://truyen-chu-nine.vercel.app/
// @version      1.0
// @description  Tự chuyển trang chương của Cơm Nguội thành chế độ đọc sạch (không quảng cáo, có nút Sau). Thêm ?raw=1 vào địa chỉ để xem trang gốc.
// @match        https://comnguoinovel.com/truyen/*/chuong/*
// @run-at       document-idle
// @noframes
// @grant        none
// @updateURL    https://truyen-chu-nine.vercel.app/phone-reader/reader.user.js
// @downloadURL  https://truyen-chu-nine.vercel.app/phone-reader/reader.user.js
// ==/UserScript==

(function () {
  if (location.search.indexOf('raw') >= 0) { return; }
  var t0 = Date.now();
  (function wait() {
    var m = document.querySelector('main');
    var ready = m && m.innerText.length > 800 && /(^|\n)\s*Chương\s*\d+/.test(m.innerText);
    if (ready) {
      var s = document.createElement('script');
      s.src = 'https://truyen-chu-nine.vercel.app/phone-reader/reader.js?' + Date.now();
      document.body.appendChild(s);
    } else if (Date.now() - t0 < 60000) {
      setTimeout(wait, 700);
    }
  })();
})();
