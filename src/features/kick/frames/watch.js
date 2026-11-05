// The stream view frames Kick's channel page, and watch.css reduces it to just the player. Kick's
// separate embed player, player.kick.com, stops at low quality. Normal Kick tabs are untouched.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  root.toggleAttribute('data-skek-kick-watch', true);

  // watch-start.js runs in the page itself, where it can't read settings.
  const setQuality = (quality) => {
    root.dataset.skekQuality = quality;
  };
  const { settingDefaults } = skek;
  chrome.storage.local.get(settingDefaults).then(({ streamQuality }) => setQuality(streamQuality));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.streamQuality) setQuality(changes.streamQuality.newValue ?? settingDefaults.streamQuality);
  });
})();
