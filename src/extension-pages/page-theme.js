// Applies the Theme setting to one of the extension's own pages, and follows it when it changes.
// page.css keeps the page hidden until this has run, so a light page never flashes dark.
(() => {
  'use strict';

  const { settingDefaults, resolveTheme } = skek;

  // `name` picks the theme's colors from features/themes/palettes.css and `base` says whether
  // it's a dark or a light one.
  function apply(theme) {
    const { name, base } = resolveTheme(theme);
    document.documentElement.dataset.skekTheme = name;
    document.documentElement.dataset.skekThemeBase = base;
  }

  chrome.storage.local.get({ theme: settingDefaults.theme }).then(({ theme }) => apply(theme));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) apply(changes.theme.newValue);
  });
})();
