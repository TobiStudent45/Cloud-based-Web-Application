/* Home page behaviour: reveal, hero parallax, card spotlight. */
(function () {
  var home = document.querySelector('.home');
  if (!home) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduce && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-home');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    home.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });

    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        cio.unobserve(el);
        var to = +el.dataset.n, from = +(el.dataset.from || 0), plain = el.dataset.plain, t0 = Date.now();
        var t = setInterval(function () {
          var k = Math.min(1, (Date.now() - t0) / 1600);
          var v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
          el.textContent = plain ? v : v.toLocaleString('de-DE');
          if (k >= 1) clearInterval(t);
        }, 30);
      });
    }, { threshold: 0.6 });
    home.querySelectorAll('[data-n]').forEach(function (el) { cio.observe(el); });
  }

  var stage = document.getElementById('home-stage');
  var tl = document.getElementById('home-timeline');
  var steps = tl ? tl.querySelectorAll('li') : [];
  var ticking = false;

  var tlCur = 0, tlTarget = 0, tlRaf = 0;

  function paintTimeline() {
    tl.style.setProperty('--tp', tlCur);
    steps.forEach(function (li, i) {
      li.style.setProperty('--i', (i * 0.35) + 's');
      li.classList.toggle('on', tlCur >= (i / steps.length) * 0.95 + 0.01);
    });
  }

  function tlTick() {
    tlCur += (tlTarget - tlCur) * 0.07;
    if (Math.abs(tlTarget - tlCur) < 0.0005) tlCur = tlTarget;
    paintTimeline();
    tlRaf = tlCur === tlTarget ? 0 : requestAnimationFrame(tlTick);
  }

  function updateTimeline() {
    if (!tl) return;
    if (reduce) { tlCur = tlTarget = 1; paintTimeline(); return; }
    var r = tl.getBoundingClientRect();
    tlTarget = Math.min(1, Math.max(0, (window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.2)));
    if (!tlRaf) tlRaf = requestAnimationFrame(tlTick);
  }

  function update() {
    ticking = false;
    updateTimeline();
    if (!stage) return;
    if (reduce) return;
    var r = stage.getBoundingClientRect();
    var p = Math.min(1, Math.max(0, (window.innerHeight * 0.9 - r.top) / (window.innerHeight * 0.9)));
    stage.classList.toggle('show', p > 0.5);
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  var zooming = false;
  function resetZoom() {
    zooming = false;
    document.querySelectorAll('.home-veil').forEach(function (v) { v.remove(); });
    home.getAnimations().forEach(function (a) { a.cancel(); });
  }
  window.addEventListener('pageshow', function (e) { if (e.persisted) resetZoom(); });

  home.querySelectorAll('a[href="/configurator"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      if (reduce || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (zooming || !home.animate) return;
      e.preventDefault();
      zooming = true;
      var b = link.getBoundingClientRect();
      var x = b.left + b.width / 2, y = b.top + b.height / 2;
      var hr = home.getBoundingClientRect();
      var reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 40;
      var ease = 'cubic-bezier(.65,0,.35,1)', ms = 750;
      home.style.transformOrigin = (x - hr.left) + 'px ' + (y - hr.top) + 'px';
      home.animate([{ transform: 'scale(1)', filter: 'blur(0px)' }, { transform: 'scale(1.7)', filter: 'blur(5px)' }], { duration: ms, easing: ease, fill: 'forwards' });
      var veil = document.createElement('div');
      veil.className = 'home-veil';
      veil.setAttribute('aria-hidden', 'true');
      document.body.appendChild(veil);
      veil.animate([{ clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)' }, { clipPath: 'circle(' + reach + 'px at ' + x + 'px ' + y + 'px)' }], { duration: ms, easing: ease, fill: 'forwards' });
      try { sessionStorage.setItem('aureo-zoom', '1'); } catch (err) {}
      setTimeout(function () { window.location.href = link.href; }, ms - 40);
    });
  });

  home.querySelectorAll('.tile').forEach(function (c) {
    c.addEventListener('mousemove', function (e) {
      var b = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - b.left) + 'px');
      c.style.setProperty('--my', (e.clientY - b.top) + 'px');
    });
  });
})();
