// Hero plate: scattered icon pattern around the hero illustration, plus the platform pill. Pill titles follow <html lang>.
(function () {
  'use strict';
  var TXT = {
    hr: ['macOS i iOS', 'Windows', 'Linux', 'Android'],
    en: ['macOS and iOS', 'Windows', 'Linux', 'Android'],
    de: ['macOS und iOS', 'Windows', 'Linux', 'Android']
  };
  var T = TXT[document.documentElement.lang] || TXT.hr;
  var HX = {
    m: {
      icons: ['bars', 'note', 'pie', 'pencil', 'line', 'calc', 'box', 'receipt', 'cal'],
      plats: [['p-apple', T[0]], ['p-win', T[1]], ['p-linux', T[2]], ['p-android', T[3]]]
    }
  };
  function icon(id, x, y, s, r, extra) {
    return '<span class="hx-ic' + (extra || '') + '" style="--x:' + x + '%;--y:' + y + '%;--s:' + s + 'px;--r:' + r + 'deg"><svg><use href="#hx-' + id + '"/></svg></span>';
  }
  function build(tile) {
    var p = HX[tile.dataset.p], pat = '';
    if (!p) return;
    // The pattern itself is built by fit() once the plate has a size.
    tile.insertAdjacentHTML('afterbegin', '<div class="hx-deco"><div class="hx-pat">' + pat + '</div></div>');
    tile.insertAdjacentHTML('beforeend', '<div class="hx-plats hx-tr-pill">' + p.plats.map(function (q) { return '<span title="' + q[1] + '"><svg><use href="#hx-' + q[0] + '"/></svg></span>'; }).join('') + '</div>');
  }
  document.querySelectorAll('.hx[data-p]').forEach(build);
  // Colour a scattered handful of pattern icons: only icons clear of text lines, buttons, devices and the
  // platform pill, each a different icon, spaced apart, in a fixed pseudo-random order per tile.
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
    document.querySelectorAll('.hx[data-p]').forEach(function (t, ti) {
      var txt = t.querySelector('.hx-deco + div'), tr = t.getBoundingClientRect();
      if (!tr.width) return;
      // Staggered grid sized to the plate, so a tall phone plate gets the same spacing as a wide desktop one.
      var p = HX[t.dataset.p], cols = Math.max(5, Math.round(tr.width / 92)), rows = Math.max(5, Math.round(tr.height / 72)), key = cols + 'x' + rows;
      var patEl = t.querySelector('.hx-pat');
      if (patEl.dataset.k !== key) {
        var pat = '';
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          var n = r * cols + c, id = p.icons[(n + r * 2) % p.icons.length];
          pat += icon(id, (c + (r % 2 ? 0.75 : 0.25)) * 100 / cols, (r + 0.5) * 100 / rows, 30, (r + c) % 2 ? 12 : -12, '" data-i="' + id);
        }
        patEl.innerHTML = pat; patEl.dataset.k = key;
      }
      var blocks = (txt ? textRects(txt) : []).concat([t.querySelector('.hero-sh'), t.querySelector('.hx-plats')]
        .filter(Boolean).map(function (el) { return el.getBoundingClientRect(); }));
      // Narrow (phone) plates: tighter clearance so icons can sit in the gaps between text lines.
      var narrow = tr.width < 560, m = narrow ? 3 : 8;
      var ics = [].slice.call(t.querySelectorAll('.hx-pat .hx-ic')), free = [];
      ics.forEach(function (ic, i) {
        ic.classList.remove('hx-hot');
        var f = ic.getBoundingClientRect();
        if (f.left < tr.left || f.right > tr.right || f.top < tr.top || f.bottom > tr.bottom) return;
        if (blocks.some(function (k) { return !(f.right <= k.left - m || f.left >= k.right + m || f.bottom <= k.top - m || f.top >= k.bottom + m); })) return;
        free.push({ ic: ic, f: f, k: ((i + 1) * 2654435761 + ti * 97) % 1000 });
      });
      free.sort(function (a, b) { return a.k - b.k; });
      // A few more than one per 55k px²; spaced apart, and the same icon only far from its twin.
      var want = Math.min(12, Math.max(6, Math.round(tr.width * tr.height / (narrow ? 35000 : 55000)))), gap = narrow ? 64 : Math.min(tr.width, tr.height) / 5, picked = [];
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
    });
  }
  addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();})();
