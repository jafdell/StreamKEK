// Applies the Theme setting to one of the extension's own pages, and follows it when it changes.
// page.css keeps the page hidden until this has run, so a light page never flashes dark.
(() => {
  'use strict';

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
  }

  chrome.storage.local.get({ theme: skek.settingDefaults.theme }).then(({ theme }) => apply(theme));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) apply(changes.theme.newValue ?? skek.settingDefaults.theme);
  });
})();
