(function () {
  'use strict';
  var KEYS = ['android', 'macos', 'windows', 'linux'];
  var NAMES = { android: 'Android', ios: 'iOS', macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  // iOS ships through the App Store only: its cards are static (data-static) and always say Coming soon.
  var ORDER = ['android', 'ios', 'macos', 'windows', 'linux'];
  // Platforms whose build may trail the others: while the manifest lacks them their cards say Coming soon instead of vanishing.
  var LATE = ['linux'];

  function detectOs() {
    var uad = navigator.userAgentData;
    var ua = navigator.userAgent || '';
    var p = uad && uad.platform ? uad.platform : ua;
    if (/android/i.test(p) || /android/i.test(ua)) return 'android';
    // iPhone / iPad (also iPadOS posing as a Mac): the static iOS card is highlighted
    if (/iphone|ipad|ipod/i.test(ua) || (/mac/i.test(p) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/mac/i.test(p)) return 'macos';
    if (/win/i.test(p)) return 'windows';
    // Android returned above and ChromeOS reports 'Chrome OS' / CrOS (no 'linux'), so this is a Linux desktop.
    if (/linux/i.test(p)) return 'linux';
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

  // Shown until the first real release exists: every platform at 1.0.0, with Coming soon chips instead of download buttons.
  var PLACEHOLDER_VERSION = '1.0.0';

  function hasRelease(data) {
    return KEYS.some(function (key) { return data && data[key] && typeof data[key].version === 'string' && data[key].version; });
  }

  // A row without a published build swaps its download button for the Coming soon chip.
  function showSoonChips(root) {
    var chips = root.querySelectorAll('.chip[hidden]');
    for (var m = 0; m < chips.length; m++) {
      chips[m].hidden = false;
      var btn = chips[m].parentNode.querySelector('.btn');
      if (btn) {
        btn.removeAttribute('href');
        btn.hidden = true;
      }
    }
  }

  function markSoon() {
    showSoonChips(document.querySelector('.dl') || document);
    // No real file yet: no size to show, no checksums and no publish date.
    var hide = document.querySelectorAll('.dl .sz, .dl .sha');
    for (var k = 0; k < hide.length; k++) hide[k].hidden = true;
    var date = document.querySelector('.dl .vline [data-head="date"]');
    if (date && date.parentNode) date.parentNode.hidden = true;
  }

  // One row of a not yet published platform: Coming soon chip, no size, no checksum entry.
  function markCardSoon(card) {
    showSoonChips(card);
    var sizes = card.querySelectorAll('.sz');
    for (var k = 0; k < sizes.length; k++) sizes[k].hidden = true;
    if (card.parentNode && card.parentNode.tagName === 'DL') card.hidden = true;
  }

  // The visitor's own platform is highlighted; its rows get the "your device" pill.
  function markOwn(os, on) {
    var mine = os ? document.querySelectorAll('[data-card="' + os + '"]') : [];
    for (var i = 0; i < mine.length; i++) mine[i].classList.toggle('rec', on);
  }

  var os = detectOs();
  // Marked before the manifest arrives, so the pill does not pop in after load.
  markOwn(os, true);

  function fill(data) {
    var soon = !hasRelease(data);
    if (soon) data = { android: { version: PLACEHOLDER_VERSION }, macos: { version: PLACEHOLDER_VERSION }, windows: { version: PLACEHOLDER_VERSION }, linux: { version: PLACEHOLDER_VERSION } };
    var present = [];
    KEYS.forEach(function (key) {
      var entry = data && data[key];
      var cards = document.querySelectorAll('[data-card="' + key + '"]');
      var usable = entry && typeof entry.version === 'string' && entry.version;
      // Some platforms are published while a late one is not yet: that one shows the disabled Coming soon state.
      var pending = !usable && !soon && LATE.indexOf(key) >= 0;
      if (pending) entry = { version: PLACEHOLDER_VERSION };
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (!usable && !pending) { c.hidden = true; continue; }
        c.hidden = false;
        setAll(c, 'ver', entry.version);
        if (typeof entry.size === 'number' && entry.size > 0) setAll(c, 'size', String(Math.round(entry.size / 1048576)));
        var date = entry.publishedAt && fmtDate(entry.publishedAt);
        if (date) setAll(c, 'date', date);
        if (typeof entry.sha256 === 'string' && entry.sha256.length >= 8) {
          setAll(c, 'sha', entry.sha256);
        }
        if (pending) markCardSoon(c);
      }
      if (usable) present.push(key);
    });
    if (soon) markSoon();
    else {
      // Download calls to action (the hero button) appear only once at least one build is published.
      var live = document.querySelectorAll('[data-live]');
      for (var n = 0; n < live.length; n++) live[n].hidden = false;
    }

    // The heading follows the visitor's platform, otherwise the newest published version.
    var head = present.indexOf(os) >= 0 ? os : present.slice().sort(function (a, b) {
      return cmp(data[b].version, data[a].version);
    })[0];
    // No build for the visitor's platform: drop the highlight.
    if (present.indexOf(os) < 0 && os !== 'ios') markOwn(os, false);
    setHead('ver', data[head].version);
    var headDate = data[head].publishedAt && fmtDate(data[head].publishedAt);
    if (headDate) setHead('date', headDate);

    var sub = document.querySelector('.dl .sub');
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
