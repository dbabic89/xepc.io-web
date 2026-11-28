// Hero plate: scattered food icons, a laptop and a phone showing generic app screens (skeleton bars only).
(function () {
  var tile = document.querySelector('.hx[data-p]');
  if (!tile) return;
  var dev = tile.querySelector('.hx-dev');
  var icons = ['burger', 'pizza', 'drink', 'pasta', 'rice', 'fries', 'coffee', 'drum', 'pizza'];
  // Illustration labels per page language (document.documentElement.lang).
  var LBL = {
    hr: { menu: 'Jelovnik', orders: 'Narudžbe', kitchen: 'Kuhinja', club: 'Klub', reports: 'Izvještaji', cart: 'Košarica', all: 'Sve' },
    en: { menu: 'Menu', orders: 'Orders', kitchen: 'Kitchen', club: 'Club', reports: 'Reports', cart: 'Cart', all: 'All' },
    de: { menu: 'Speisekarte', orders: 'Bestellungen', kitchen: 'Küche', club: 'Club', reports: 'Berichte', cart: 'Warenkorb', all: 'Alle' }
  };
  var T = LBL[document.documentElement.lang] || LBL.hr;
  var plats = [['p-android', 'Android'], ['p-apple', 'iOS'], ['p-web', 'Web']];
  function sk(w, cls) { return '<s' + (cls ? ' class="hx-' + cls + '"' : '') + (w ? ' style="width:' + w + '"' : '') + '></s>'; }
  function tr(w) { return '<div class="hx-tr">' + sk(w) + sk('', 'n') + '<span class="hx-sw"></span></div>'; }
  var lap = '<div class="hx-ks"><div class="hx-sd"><em class="hx-on">' + T.menu + '</em><em>' + T.orders + '</em><em>' + T.kitchen + '</em><em>' + T.club + '</em><em>' + T.reports + '</em></div><div class="hx-mn">' +
    '<div class="hx-h">' + T.kitchen + '</div><div class="hx-kd"><div>' + sk('55%', 'hd') + sk('80%') + '</div><div class="hx-r">' + sk('50%', 'hd') + sk('70%') + '</div><div>' + sk('45%', 'hd') + sk('75%') + '</div></div>' +
    '<div class="hx-h" style="margin-top:3px">' + T.menu + '</div><div>' + tr('70%') + tr('55%') + tr('85%') + tr('45%').replace('hx-sw', 'hx-sw hx-on') + '</div></div></div>';
  function mi(w) { return '<div class="hx-mi"><i></i>' + sk(w) + sk('', 'n') + '</div>'; }
  var ph = '<div class="hx-kp2">' + sk('50%', 'hd') + '<div class="hx-cats"><span class="hx-on">' + T.all + '</span><span>&nbsp;&nbsp;&nbsp;&nbsp;</span><span>&nbsp;&nbsp;&nbsp;&nbsp;</span></div>' +
    mi('70%') + mi('60%') + mi('75%') + mi('55%') + '<div class="hx-cart"><span>' + T.cart + '</span></div></div>';
  dev.innerHTML = '<div class="hx-lap"><div class="hx-scr"><div>' + lap + '</div></div><div class="hx-base"></div></div><div class="hx-ph"><span class="hx-nt"></span>' + ph + '</div>';
  tile.insertAdjacentHTML('afterbegin', '<div class="hx-deco" aria-hidden="true"><div class="hx-pat"></div></div>');
  tile.insertAdjacentHTML('beforeend', '<div class="hx-plats hx-tr-pill" aria-hidden="true">' + plats.map(function (q) { return '<span><svg><use href="#hx-' + q[0] + '"/></svg></span>'; }).join('') + '</div>');

  function icon(id, x, y, s, r, extra) {
    return '<span class="hx-ic' + (extra || '') + '" style="--x:' + x + '%;--y:' + y + '%;--s:' + s + 'px;--r:' + r + 'deg"><svg><use href="#hx-' + id + '"/></svg></span>';
  }
  // Rects of text lines and buttons, so highlighted icons stay clear of them.
  function textRects(box) {
    var out = [];
    box.querySelectorAll('*').forEach(function (el) {
      if (el.matches('a, button, .btn, [class*="btn"]')) { out.push.apply(out, el.getClientRects()); return; }
      el.childNodes.forEach(function (n) {
        if (n.nodeType !== 3 || !n.textContent.trim()) return;
        var rg = document.createRange(); rg.selectNodeContents(n); out.push.apply(out, rg.getClientRects());
      });
    });
    return out;
  }
  function fit() {
    var txt = tile.querySelector('.hx-deco + div'), tr0 = tile.getBoundingClientRect();
    if (!tr0.width) return;
    var cols = Math.max(5, Math.round(tr0.width / 92)), rows = Math.max(5, Math.round(tr0.height / 72)), key = cols + 'x' + rows;
    var patEl = tile.querySelector('.hx-pat');
    if (patEl.dataset.k !== key) {
      var pat = '';
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var n = r * cols + c, id = icons[(n + r * 2) % icons.length];
        pat += icon(id, (c + (r % 2 ? 0.75 : 0.25)) * 100 / cols, (r + 0.5) * 100 / rows, 30, (r + c) % 2 ? 12 : -12, '" data-i="' + id);
      }
      patEl.innerHTML = pat; patEl.dataset.k = key;
    }
    var blocks = (txt ? textRects(txt) : []).concat([tile.querySelector('.hx-lap'), tile.querySelector('.hx-ph'), tile.querySelector('.hx-plats')]
      .filter(Boolean).map(function (el) { return el.getBoundingClientRect(); }));
    var narrow = tr0.width < 560, m = narrow ? 3 : 8;
    var free = [];
    [].slice.call(tile.querySelectorAll('.hx-pat .hx-ic')).forEach(function (ic, i) {
      ic.classList.remove('hx-hot');
      var f = ic.getBoundingClientRect();
      if (f.left < tr0.left || f.right > tr0.right || f.top < tr0.top || f.bottom > tr0.bottom) return;
      if (blocks.some(function (k) { return !(f.right <= k.left - m || f.left >= k.right + m || f.bottom <= k.top - m || f.top >= k.bottom + m); })) return;
      free.push({ ic: ic, f: f, k: ((i + 1) * 2654435761) % 1000 });
    });
    free.sort(function (a, b) { return a.k - b.k; });
    var want = Math.min(12, Math.max(6, Math.round(tr0.width * tr0.height / (narrow ? 35000 : 55000)))), gap = narrow ? 64 : Math.min(tr0.width, tr0.height) / 5, picked = [];
    [true, false].forEach(function (uniq) {
      free.forEach(function (o) {
        if (picked.length >= want || o.ic.classList.contains('hx-hot')) return;
        if (picked.some(function (q) {
          var d = Math.hypot(q.f.left - o.f.left, q.f.top - o.f.top);
          return d < gap || (q.ic.dataset.i === o.ic.dataset.i && (uniq || d < gap * 3));
        })) return;
        picked.push(o); o.ic.classList.add('hx-hot');
      });
    });
  }
  addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();
})();
