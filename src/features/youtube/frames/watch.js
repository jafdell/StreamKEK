// The stream view frames the watch page, and watch.css reduces it to just the player.
// Normal YouTube tabs are untouched.
(() => {
  'use strict';

  // By the top of the frame chain, not the parent: rules/youtube-watch-frame.json applies to any /watch
  // frame Twitch opens, so a frame in between mustn't bring back the full page, with its Subscribe button.
  if (window === window.top || !location.ancestorOrigins[location.ancestorOrigins.length - 1]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  root.classList.add('skek-watch');

  // YouTube's own chat is on this page too. watch.css hides it, since the stream view shows chat in a
  // frame of its own, but hidden it would still load and run. So its frame goes as soon as YouTube
  // adds it, before it has loaded, and again if YouTube ever adds another.
  new MutationObserver(() => document.getElementById('chatframe')?.remove()).observe(root, { childList: true, subtree: true });

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
