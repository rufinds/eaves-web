// Privacy-friendly analytics events. Works with Plausible or Umami, whichever
// snippet is on the page. Without a snippet it does nothing.
(function () {
  function track(name, props) {
    try {
      if (typeof window.plausible === 'function') {
        window.plausible(name, { props: props });
      } else if (window.umami && typeof window.umami.track === 'function') {
        window.umami.track(name, props);
      }
    } catch (e) { /* analytics must never break the page */ }
  }

  // Which part of the page a link sits in: header, hero, final, footer, ...
  function place(el) {
    var s = el.closest('header, footer, .hero, .final, .creators, .features, .events, .faq, .evp, main');
    if (!s) return 'page';
    if (s.tagName === 'HEADER') return 'header';
    if (s.tagName === 'FOOTER') return 'footer';
    return String(s.className || s.tagName).split(' ')[0];
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var rel = a.getAttribute('rel') || '';
    var where = place(a);

    if (href.indexOf('apps.apple.com') !== -1) track('Store click apple', { place: where });
    else if (href.indexOf('play.google.com') !== -1) track('Store click google', { place: where });
    else if (href.indexOf('/app') === 0) track('Download click', { place: where });
    else if (a.id === 'openApp') track('Open in app click', { place: where });
    else if (rel.indexOf('nofollow') !== -1) track('Ticket click', { place: where });
    else if (href.indexOf('/for-') === 0) track('Role page click', { page: href.replace(/\//g, ''), place: where });
  });
})();