// Applies the saved theme before the first paint so the app never flashes the wrong palette.
// "Follow the sun" is approximated here (dark 19:00–07:00) until the app computes sunset.
(function () {
  try {
    var prefs = JSON.parse(localStorage.getItem('household:prefs') || '{}');
    var mode = prefs.theme || 'dark';
    var hour = new Date().getHours();
    var dark =
      mode === 'light'
        ? false
        : mode === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : mode === 'sun'
            ? hour < 7 || hour >= 19
            : true;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {
    /* storage unavailable: keep the dark default */
  }
})();
