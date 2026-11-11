// Runs in Twitch's embedded player, which the multi-stream view uses for Twitch streams. quality.js,
// auto-reload.js and background-quality.js run there too, in the page itself, where they can't
// read settings, so this gives them theirs as attributes, as src/twitch/page-sync.js does on
// Twitch's own pages.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  const { settingDefaults } = skek;
  const KEYS = ['streamQuality', 'autoReloadPlayer', 'keepBackgroundQuality'];

  function apply({ streamQuality, autoReloadPlayer, keepBackgroundQuality }) {
    root.dataset.skekQuality = streamQuality;
    root.toggleAttribute('data-skek-auto-reload', autoReloadPlayer === true);
    root.toggleAttribute('data-skek-keep-quality', keepBackgroundQuality === true);
  }

  const read = () => chrome.storage.local.get(settingDefaults).then(apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEYS.some((key) => key in changes)) read();
  });
  read();
})();
