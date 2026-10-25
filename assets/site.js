(function () {
  'use strict';
  var root = document.documentElement;
  var themeBtn = document.getElementById('theme');
  themeBtn.addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* storage unavailable */ }
  });

  var video = document.getElementById('video');
  var player = document.getElementById('watch');
  var chapters = Array.prototype.slice.call(document.querySelectorAll('#chapters button'));
  var lines = Array.prototype.slice.call(document.querySelectorAll('#lines .line'));
  var lineWords = lines.map(function (l) { return Array.prototype.slice.call(l.querySelectorAll('.w')); });

  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 80 && r.top < window.innerHeight - 40;
  }
  function seek(t, scroll) {
    video.currentTime = t + 0.01;
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
    if (scroll && !inView(video)) player.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  chapters.forEach(function (b) { b.addEventListener('click', function () { seek(+b.dataset.t, false); }); });
  document.querySelectorAll('.step .thumb').forEach(function (b) { b.addEventListener('click', function () { seek(+b.dataset.t, true); }); });
  lines.forEach(function (l) {
    l.addEventListener('click', function (e) { if (e.target.closest('a')) return; seek(+l.dataset.s, true); });
    l.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seek(+l.dataset.s, true); } });
  });

  var lastLine = -1;
  function sync() {
    var t = video.currentTime;
    chapters.forEach(function (b) {
      var on = t >= +b.dataset.t && t < +b.dataset.end;
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var cur = -1;
    for (var i = 0; i < lines.length; i++) {
      if (t >= +lines[i].dataset.s - 0.15 && t <= +lines[i].dataset.e + 0.35) { cur = i; break; }
    }
    if (cur !== lastLine) {
      if (lastLine >= 0) {
        lines[lastLine].classList.remove('on');
        lineWords[lastLine].forEach(function (w) { w.classList.remove('spoken', 'now'); });
      }
      if (cur >= 0) {
        lines[cur].classList.add('on');
        var list = document.getElementById('lines');
        if (!video.paused && inView(list) && !inView(lines[cur])) lines[cur].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      lastLine = cur;
    }
    if (cur >= 0) {
      lineWords[cur].forEach(function (w) {
        var s = +w.dataset.s, e = +w.dataset.e;
        w.classList.toggle('spoken', t >= s);
        w.classList.toggle('now', t >= s && t < e + 0.05);
      });
    }
  }
  var raf = 0;
  function loop() { sync(); raf = video.paused ? 0 : requestAnimationFrame(loop); }
  video.addEventListener('play', function () { if (!raf) raf = requestAnimationFrame(loop); });
  video.addEventListener('seeked', sync);
  video.addEventListener('timeupdate', function () { if (!raf) sync(); });

  // fact check filters
  var filters = Array.prototype.slice.call(document.querySelectorAll('.filters button'));
  var claims = Array.prototype.slice.call(document.querySelectorAll('#claims .claim'));
  filters.forEach(function (b) {
    b.addEventListener('click', function () {
      filters.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      claims.forEach(function (c) { c.hidden = !(b.dataset.f === 'all' || c.dataset.org === b.dataset.f); });
    });
  });
})();
