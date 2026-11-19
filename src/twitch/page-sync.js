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
      if (localStorage.getItem(key) !== value) localStorage.setItem(key, value);
    } catch {
      // Then the next page starts in Twitch's own theme and is switched once it has loaded.
    }
  }

  // CSS matches data-skek-theme for one theme and data-skek-theme-base for every dark or light one.
  // features/themes/twitch-base.js switches Twitch to that base, in the page that's open.
  function applyTheme(setting) {
    const { name, base } = resolveTheme(setting);
    root.dataset.skekTheme = name;
    root.dataset.skekThemeBase = base;
    return { name, base };
  }

  // CSS gated on html[data-skek-on~='<key>'] can't flash when Twitch re-renders, and
  // an attribute survives if anything ever overwrites <html>'s class.
  function applySettings() {
    chrome.storage.local.get(settingDefaults).then((values) => {
      root.dataset.skekOn = SETTINGS.filter((s) => values[s.key] === true).map((s) => s.key).join(' ');
      root.dataset.skekQuality = values.streamQuality;
      root.toggleAttribute('data-skek-chat-font', values.chatFontSize !== 'twitch');
      root.style.setProperty('--skek-chat-font-size', `${values.chatFontSize}px`);
      const { name, base } = applyTheme(values.theme);
      if (!isTopPage) return;
      store(THEME_CACHE, name);
      // Twitch reads this when a page starts, so the next one starts in the theme's base.
      store(TWITCH_THEME, base === 'dark' ? '1' : '0');
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SETTINGS.some((s) => s.key in changes)) applySettings();
  });
  applyTheme(stored(THEME_CACHE));
  applySettings();
})();
