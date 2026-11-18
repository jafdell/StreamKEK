// Applies the Theme setting to one of the extension's own pages, and follows it when it changes.
// page.css keeps the page hidden until this has run, so a light page never flashes dark.
(() => {
  'use strict';

  const { settingDefaults, resolveTheme } = skek;

  // twitchTheme is Twitch's own theme, which the Twitch page saves for the Twitch choice. Before
  // any Twitch page has, that choice is dark here. `name` picks the theme's colors from
  // features/themes/palettes.css and `base` says whether it's a dark or a light one.
  function apply() {
    chrome.storage.local.get({ theme: settingDefaults.theme, twitchTheme: null }).then(({ theme, twitchTheme }) => {
      const { name, base } = resolveTheme(theme, twitchTheme);
      document.documentElement.dataset.skekTheme = name;
      document.documentElement.dataset.skekThemeBase = base;
    });
  }

  apply();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.theme || changes.twitchTheme)) apply();
  });
})();
