(function () {
  var btn = document.getElementById('openApp');
  if (!btn) return;

  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.eaves.app';
  var ANDROID_PACKAGE = 'com.eaves.app';
  var APP_SCHEME = 'eaves';

  var ua = navigator.userAgent || navigator.vendor || window.opera || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  var isAndroid = /Android/.test(ua);
  var eventId = btn.getAttribute('data-event-id');
  var hint = document.getElementById('installHint');

  // Desktop: opening an app makes no sense, only the store badges remain.
  if (!isIOS && !isAndroid) {
    btn.hidden = true;
    return;
  }

  // Android: the intent URL opens the app when it is installed and sends the
  // browser to the Play Store when it is not.
  if (isAndroid) {
    btn.href =
      'intent://event/' + eventId +
      '#Intent;scheme=' + APP_SCHEME +
      ';package=' + ANDROID_PACKAGE +
      ';S.browser_fallback_url=' + encodeURIComponent(PLAY_URL) +
      ';end';
  }

  // When the app opens, the page is hidden. If it is still visible shortly
  // after the tap, the app is most likely not installed. iOS gets a longer
  // delay because Safari first asks for confirmation.
  var timer = null;

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  btn.addEventListener('click', function () {
    cancel();
    timer = setTimeout(function () {
      if (!document.hidden && hint) hint.hidden = false;
    }, isIOS ? 2500 : 1800);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) cancel();
  });
  window.addEventListener('pagehide', cancel);
})();