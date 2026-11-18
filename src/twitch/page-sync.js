// Keeps every Twitch page in step with the extension's settings.
(() => {
  'use strict';

  // Also runs in Twitch's chat in the multi-stream view, but not in that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const { SETTINGS, settingDefaults, resolveTheme } = skek;
  const root = document.documentElement;
  const isTopPage = window === window.top;

  // Twitch keeps its own theme in its localStorage: '1' is dark and '0' is light.
  const TWITCH_THEME = 'twilight.theme';
  // Twitch's own theme from before a theme here switched it, to put back with the Twitch choice.
  const TWITCH_THEME_BEFORE = 'skek-twitch-theme';
  // The Theme setting as last seen. The first paint uses it, since storage answers too late for that.
  const THEME_CACHE = 'skek-theme';

  // Twitch's localStorage can be blocked, in a frame for example.
  function stored(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else if (localStorage.getItem(key) !== value) localStorage.setItem(key, value);
    } catch {
      // Then the next page starts in Twitch's own theme and is switched once it has loaded.
    }
  }

  let themeSetting = stored(THEME_CACHE) ?? settingDefaults.theme;
  // What storage has as Twitch's own theme, for the extension's own pages. Undefined until it answers.
  let savedTwitchTheme;
  // The theme Twitch is being switched back to, until it shows it.
  let restoring = null;
  let restoreTimer = 0;

  const savedAsTheme = (value) => (value === '0' ? 'light' : 'dark');

  // Twitch's own theme right now, or null before Twitch has put it on <html>.
  function shownTwitchTheme() {
    if (root.classList.contains('tw-root--theme-light')) return 'light';
    return root.classList.contains('tw-root--theme-dark') ? 'dark' : null;
  }

  // This runs whenever <html>'s class changes, which is often, so it only writes what's different.
  function setAttribute(name, value) {
    if (value === null) root.removeAttribute(name);
    else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  // CSS matches data-skek-theme for one theme and data-skek-theme-base for every dark or light one.
  // features/themes/twitch-base.js switches Twitch to data-skek-twitch-base.
  function applyTheme() {
    const own = restoring ?? shownTwitchTheme() ?? savedAsTheme(stored(TWITCH_THEME));
    const { name, base, followsTwitch } = resolveTheme(themeSetting, own);
    setAttribute('data-skek-theme', name);
    setAttribute('data-skek-theme-base', base);
    setAttribute('data-skek-twitch-base', followsTwitch ? restoring : base);

    // The extension's own pages can't see Twitch's theme, so they get it from storage.
    if (isTopPage && followsTwitch && !restoring && savedTwitchTheme !== undefined && savedTwitchTheme !== own) {
      savedTwitchTheme = own;
      chrome.storage.local.set({ twitchTheme: own });
    }
  }

  // Saves the theme's base as Twitch's own theme, so the next page starts in it, and puts back what
  // Twitch had once the Theme setting is Twitch again. `live` also switches the page that's open.
  function saveTwitchTheme(live) {
    const { base, followsTwitch } = resolveTheme(themeSetting);
    const before = stored(TWITCH_THEME_BEFORE);
    if (!followsTwitch) {
      if (before === null) store(TWITCH_THEME_BEFORE, stored(TWITCH_THEME) ?? '');
      store(TWITCH_THEME, base === 'dark' ? '1' : '0');
      return;
    }
    if (before !== null) {
      store(TWITCH_THEME, before || null);
      store(TWITCH_THEME_BEFORE, null);
    }
    const own = stored(TWITCH_THEME);
    if ((!live && before === null) || own === null) return;
    restoring = savedAsTheme(own);
    clearTimeout(restoreTimer);
    // Twitch's page can't always be switched, so stop waiting and show what it has.
    restoreTimer = setTimeout(() => {
      restoring = null;
      applyTheme();
    }, 3000);
  }

  let loaded = false;

  // CSS gated on html[data-skek-on~='<key>'] can't flash when Twitch re-renders, and
  // an attribute survives if anything ever overwrites <html>'s class.
  function applySettings() {
    chrome.storage.local.get({ ...settingDefaults, twitchTheme: null }).then((values) => {
      root.dataset.skekOn = SETTINGS.filter((s) => values[s.key] === true).map((s) => s.key).join(' ');
      root.dataset.skekQuality = values.streamQuality;
      root.toggleAttribute('data-skek-chat-font', values.chatFontSize !== 'twitch');
      root.style.setProperty('--skek-chat-font-size', `${values.chatFontSize}px`);

      const themeChanged = loaded && values.theme !== themeSetting;
      loaded = true;
      themeSetting = values.theme;
      savedTwitchTheme = values.twitchTheme;
      if (isTopPage) {
        store(THEME_CACHE, themeSetting);
        saveTwitchTheme(themeChanged);
      }
      applyTheme();
    });
  }

  new MutationObserver(() => {
    if (restoring && shownTwitchTheme() === restoring) {
      restoring = null;
      clearTimeout(restoreTimer);
    }
    applyTheme();
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SETTINGS.some((s) => s.key in changes)) applySettings();
  });
  applyTheme();
  applySettings();
})();
