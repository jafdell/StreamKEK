// The stream view frames Kick's channel page, and watch.css reduces it to just the player. Kick's
// separate embed player, player.kick.com, stops at low quality. Normal Kick tabs are untouched.
(() => {
  'use strict';

  // By the top of the frame chain, not the parent: your sign-in reaches any Kick frame under Twitch,
  // so a frame in between mustn't bring back the full page, with its Subscribe button.
  if (!location.ancestorOrigins[location.ancestorOrigins.length - 1]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  root.toggleAttribute('data-skek-kick-watch', true);

  // watch-start.js runs in the page itself, where it can't reach storage. It waits for the quality,
  // so the volume goes first. Streams already playing in other tabs keep their own volume.
  const setQuality = (quality) => {
    root.dataset.skekQuality = quality;
  };
  const { settingDefaults } = skek;
  chrome.storage.local.get({ ...settingDefaults, kickVolume: 1 }).then(({ streamQuality, kickVolume }) => {
    root.dataset.skekVolume = kickVolume;
    setQuality(streamQuality);
    new MutationObserver(() => {
      const volume = Number(root.dataset.skekVolume);
      if (volume > 0 && volume <= 1) chrome.storage.local.set({ kickVolume: volume });
    }).observe(root, { attributeFilter: ['data-skek-volume'] });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.streamQuality) setQuality(changes.streamQuality.newValue ?? settingDefaults.streamQuality);
  });
})();
