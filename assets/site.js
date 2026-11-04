// Feature walkthrough: one demo recording, each step plays its own segment.
(function () {
  var steps = document.querySelectorAll('.step');
  if (!steps.length || !('IntersectionObserver' in window)) return;

  var desktop = window.matchMedia('(min-width: 861px)');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var stickyVideo = document.querySelector('.sticky video');
  var allVideos = document.querySelectorAll('.step video, .sticky video');
  var current = null;
  var raf = 0;

  function videoFor(step) {
    return desktop.matches ? stickyVideo : step.querySelector('video');
  }

  function stop() {
    cancelAnimationFrame(raf);
    allVideos.forEach(function (v) { v.pause(); });
  }

  function play(step) {
    var v = videoFor(step);
    if (!v || reduce.matches) return;
    var start = parseFloat(step.getAttribute('data-start')) || 0;
    var end = parseFloat(step.getAttribute('data-end')) || 0;

    function go() {
      // Keep playing smoothly if the previous step already ended near this start.
      if (v.currentTime < start - 0.3 || v.currentTime > end) v.currentTime = start;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
      cancelAnimationFrame(raf);
      (function tick() {
        if (end > start && v.currentTime >= end) v.currentTime = start;
        raf = requestAnimationFrame(tick);
      })();
    }

    if (v.readyState >= 1) go();
    else { v.addEventListener('loadedmetadata', go, { once: true }); v.load(); }
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting || e.target === current) return;
      stop();
      current = e.target;
      steps.forEach(function (s) { s.classList.toggle('on', s === current); });
      play(current);
    });
  }, { rootMargin: '-45% 0px -45% 0px' });

  steps.forEach(function (s) { io.observe(s); });

  // Pause everything when the section is off-screen.
  var section = document.querySelector('.features');
  if (section) {
    new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) { stop(); current = null; }
    }).observe(section);
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
    v.controls = true;
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