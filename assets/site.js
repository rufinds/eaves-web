// Show the phone screenshot that belongs to the feature step in view.
(function () {
  var steps = document.querySelectorAll('.step');
  var shots = document.querySelectorAll('.sticky .device');
  if (!steps.length || !('IntersectionObserver' in window)) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = Number(e.target.getAttribute('data-i'));
      steps.forEach(function (s) { s.classList.toggle('on', s === e.target); });
      shots.forEach(function (d, n) { d.classList.toggle('on', n === i); });
    });
  }, { rootMargin: '-45% 0px -45% 0px' });

  steps.forEach(function (s) { io.observe(s); });
})();

// Slowly move the ambient glow with the scroll position.
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

// Hero video: no autoplay for reduced motion, tap to replay.
(function () {
  var v = document.querySelector('.device video');
  if (!v) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    v.pause();
    v.removeAttribute('autoplay');
    v.currentTime = 0;
  }
  v.addEventListener('click', function () {
    v.currentTime = 0;
    v.play();
  });
})();