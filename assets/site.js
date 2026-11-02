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