// Runs in Twitch's embedded player, which the multi-stream view uses for Twitch streams. quality.js
// runs there too, in the page itself, where it can't read settings, so this gives it the Stream
// quality setting as an attribute, as src/twitch/page-sync.js does on Twitch's own pages.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  const setQuality = (quality) => {
    root.dataset.skekQuality = quality;
  };
  const { settingDefaults } = skek;
  chrome.storage.local.get(settingDefaults).then(({ streamQuality }) => setQuality(streamQuality));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.streamQuality) setQuality(changes.streamQuality.newValue ?? settingDefaults.streamQuality);
  });
})();
