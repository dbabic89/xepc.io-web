(function () {
  'use strict';
  var KEYS = ['android', 'macos', 'windows'];
  var NAMES = { android: 'Android', ios: 'iOS', macos: 'macOS', windows: 'Windows' };
  // iOS ships through the App Store only: its cards are static (data-static) and always say Coming soon.
  var ORDER = ['android', 'ios', 'macos', 'windows'];

  function detectOs() {
    var uad = navigator.userAgentData;
    var ua = navigator.userAgent || '';
    var p = uad && uad.platform ? uad.platform : ua;
    if (/android/i.test(p) || /android/i.test(ua)) return 'android';
    // iPhone / iPad (also iPadOS posing as a Mac): the static iOS card is highlighted
    if (/iphone|ipad|ipod/i.test(ua) || (/mac/i.test(p) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/mac/i.test(p)) return 'macos';
    if (/win/i.test(p)) return 'windows';
    return '';
  }

  function cmp(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < 3; i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d;
    }
    return 0;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + '.';
  }

  function setAll(root, name, text, title) {
    var nodes = root.querySelectorAll('[data-f="' + name + '"]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = text;
      if (title) nodes[i].title = title;
    }
  }

  function setHead(name, text) {
    var nodes = document.querySelectorAll('[data-head="' + name + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
  }

  // Shown until the first real release exists: every platform at 1.0.0, with the download buttons disabled.
  var PLACEHOLDER_VERSION = '1.0.0';
  var SOON = { hr: 'Uskoro', en: 'Coming soon', de: 'Demnächst' };

  function hasRelease(data) {
    return KEYS.some(function (key) { return data && data[key] && typeof data[key].version === 'string' && data[key].version; });
  }

  function markSoon() {
    var label = SOON[document.documentElement.lang] || SOON.hr;
    var links = document.querySelectorAll('[data-card] a[href^="/download/"]');
    for (var i = 0; i < links.length; i++) {
      links[i].removeAttribute('href');
      links[i].setAttribute('aria-disabled', 'true');
      links[i].classList.add('soon');
      links[i].textContent = label;
    }
    // No real file yet: no size to show, and no publish date in the panel.
    var smalls = document.querySelectorAll('.pg-it[data-card]:not([data-static]) small');
    for (var j = 0; j < smalls.length; j++) smalls[j].textContent = smalls[j].textContent.split(' ')[0];
    var hide = document.querySelectorAll('.pg-get .sz, .pg-sha');
    for (var k = 0; k < hide.length; k++) hide[k].hidden = true;
    // Phone tiles say Coming soon with a chip; only the desktop rows keep a disabled button.
    var chips = document.querySelectorAll('.pg-get .chip[hidden]');
    for (var m = 0; m < chips.length; m++) {
      chips[m].hidden = false;
      var btn = chips[m].parentNode.querySelector('.btn');
      if (btn) btn.hidden = true;
    }
    var date = document.querySelector('.pg-dl .lab [data-head="date"]');
    if (date && date.parentNode) date.parentNode.hidden = true;
  }

  // The visitor's own platform is highlighted; the hero panel then shows only that card (CSS :has).
  function markOwn(os, on) {
    var mine = os ? document.querySelectorAll('[data-card="' + os + '"]') : [];
    for (var i = 0; i < mine.length; i++) mine[i].classList.toggle('rec', on);
  }

  var os = detectOs();
  // Marked before the manifest arrives, so the hero panel does not collapse from four cards to one after load.
  markOwn(os, true);

  function fill(data) {
    var soon = !hasRelease(data);
    if (soon) data = { android: { version: PLACEHOLDER_VERSION }, macos: { version: PLACEHOLDER_VERSION }, windows: { version: PLACEHOLDER_VERSION } };
    var present = [];
    KEYS.forEach(function (key) {
      var entry = data && data[key];
      var cards = document.querySelectorAll('[data-card="' + key + '"]');
      var usable = entry && typeof entry.version === 'string' && entry.version;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (!usable) { c.hidden = true; continue; }
        c.hidden = false;
        setAll(c, 'ver', entry.version);
        if (typeof entry.size === 'number' && entry.size > 0) setAll(c, 'size', String(Math.round(entry.size / 1048576)));
        var date = entry.publishedAt && fmtDate(entry.publishedAt);
        if (date) setAll(c, 'date', date);
        if (typeof entry.sha256 === 'string' && entry.sha256.length >= 8) {
          setAll(c, 'sha', entry.sha256);
        }
      }
      if (usable) present.push(key);
    });
    if (soon) markSoon();

    // The heading follows the visitor's platform, otherwise the newest published version.
    var head = present.indexOf(os) >= 0 ? os : present.slice().sort(function (a, b) {
      return cmp(data[b].version, data[a].version);
    })[0];
    // No build for the visitor's platform: drop the highlight so the panel lists every platform again.
    if (present.indexOf(os) < 0 && os !== 'ios') markOwn(os, false);
    setHead('ver', data[head].version);
    var headDate = data[head].publishedAt && fmtDate(data[head].publishedAt);
    if (headDate) setHead('date', headDate);

    var sub = document.querySelector('.pg-dl .sub');
    if (sub) {
      var names = ORDER.filter(function (k) { return k === 'ios' || present.indexOf(k) >= 0; }).map(function (k) { return NAMES[k]; });
      var list = names.length > 1
        ? names.slice(0, -1).join(', ') + (sub.getAttribute('data-and') || ', ') + names[names.length - 1]
        : names[0];
      sub.textContent = (sub.getAttribute('data-pre') || '') + list;
    }
  }

  fetch('/latest.json')
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(fill)
    .catch(function () { /* page stays usable: download links work without the manifest */ });
})();
