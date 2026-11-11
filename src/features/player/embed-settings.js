// Runs in Twitch's embedded player, which the multi-stream view uses for Twitch streams. quality.js
// and auto-reload.js run there too, in the page itself, where they can't read settings, so this
// gives them the Stream quality and Reload player on errors settings as attributes, as
// src/twitch/page-sync.js does on Twitch's own pages.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  const { settingDefaults } = skek;

  function apply({ streamQuality, autoReloadPlayer }) {
    root.dataset.skekQuality = streamQuality;
    root.toggleAttribute('data-skek-auto-reload', autoReloadPlayer === true);
  }

  const read = () => chrome.storage.local.get(settingDefaults).then(apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.streamQuality || changes.autoReloadPlayer)) read();
  });
  read();
})();
