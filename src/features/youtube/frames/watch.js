// The stream view frames the watch page, and watch.css reduces it to just the player.
// Normal YouTube tabs are untouched.
(() => {
  'use strict';

  if (window === window.top || !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  root.classList.add('skek-watch');

  // watch-start.js runs in the page itself, where it can't read settings.
  const setQuality = (quality) => {
    root.dataset.skekQuality = quality;
  };
  const { settingDefaults } = skek;
  chrome.storage.local.get(settingDefaults).then(({ streamQuality }) => setQuality(streamQuality));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.streamQuality) setQuality(changes.streamQuality.newValue ?? settingDefaults.streamQuality);
  });

  // The info bar on the Twitch page shows while the mouse moves, which stops at this frame.
  const ACTIVITY_INTERVAL_MS = 500;
  let lastActivity = 0;
  addEventListener('mousemove', () => {
    if (Date.now() - lastActivity < ACTIVITY_INTERVAL_MS) return;
    lastActivity = Date.now();
    parent.postMessage({ skekFrame: 'activity' }, location.ancestorOrigins[0]);
  });
})();
