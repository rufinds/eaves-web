// Features: one phone, one continuous journey spread over the steps.
// Each step says which screen it shows (data-screen) and how far that screen is
// scrolled at the start and end of the step (data-from / data-to, 0 = top, 1 = bottom).
(function () {
  var steps = document.querySelectorAll('.step');
  var screens = document.querySelectorAll('.sticky .scr');
  if (!steps.length || !screens.length) return;

  var desktop = window.matchMedia('(min-width: 861px)');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var active = 0;
  var ticking = false;

  function setScroll(sc, frac) {
    if (sc.classList.contains('static')) return;
    var img = sc.firstElementChild;
    var max = Math.max(0, img.offsetHeight - sc.clientHeight);
    img.style.transform = 'translate3d(0,' + (-frac * max).toFixed(1) + 'px,0)';
  }

  function update() {
    ticking = false;
    if (!desktop.matches) return; // mobile: every step shows its own static phone
    var vh = window.innerHeight;

    steps.forEach(function (s, i) {
      var r = s.getBoundingClientRect();
      if (r.top < vh * 0.55 && r.bottom > vh * 0.45) active = i; // step crossing the middle
    });

    var step = steps[active];
    var shown = Number(step.getAttribute('data-screen')) || 0;
    var from = parseFloat(step.getAttribute('data-from')) || 0;
    var to = parseFloat(step.getAttribute('data-to'));
    if (isNaN(to)) to = from;

    steps.forEach(function (s, i) { s.classList.toggle('on', i === active); });
    screens.forEach(function (sc, i) { sc.classList.toggle('on', i === shown); });

    var r = step.getBoundingClientRect();
    var p = Math.min(1, Math.max(0, (vh * 0.55 - r.top) / r.height));
    setScroll(screens[shown], from + (to - from) * p);
  }

  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  window.addEventListener('load', request); // image heights are known after load
  update();
})();

// Creators: swap the phone screenshot when a role is hovered or focused.
// Touch devices have no hover, so there the screenshots cycle on their own.
// Image order must match the order of the role links (Host, Artist, Venue).
(function () {
  var links = document.querySelectorAll('.creators .role-link');
  var shots = document.querySelectorAll('.roles-stack img');
  var stack = document.querySelector('.roles-stack');
  if (!links.length || !stack || shots.length < links.length) return;

  var current = 0;
  function show(i) {
    current = i;
    shots.forEach(function (s, n) { s.classList.toggle('on', n === i); });
  }

  links.forEach(function (l, i) {
    l.addEventListener('mouseenter', function () { show(i); });
    l.addEventListener('focus', function () { show(i); });
  });

  var noHover = !window.matchMedia('(hover: hover)').matches;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (noHover && !reduce && 'IntersectionObserver' in window) {
    var timer = null;
    new IntersectionObserver(function (entries) {
      clearInterval(timer);
      if (entries[0].isIntersecting) {
        timer = setInterval(function () { show((current + 1) % links.length); }, 3000);
      }
    }).observe(stack);
  }
})();

// Slowly move the ambient glow and tilt the hero phone with the scroll position.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      document.documentElement.style.setProperty('--sy', String(window.scrollY));
      ticking = false;
    });
  }, { passive: true });
})();

// Hero video: autoplay, loop, pause when off-screen, click to restart.
(function () {
  var v = document.querySelector('.hero .device video');
  if (!v) return;

  v.addEventListener('click', function () {
    v.currentTime = 0;
    v.play();
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    v.pause();
    v.removeAttribute('autoplay');
    v.controls = true; // make it obvious that this is a video
    return;
  }

  v.muted = true;

  function play() {
    var p = v.play();
    if (p && p.catch) p.catch(function () { v.controls = true; }); // e.g. iOS Low Power Mode
  }

  play();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) play(); else v.pause();
    }, { threshold: 0.25 }).observe(v);
  }
})();