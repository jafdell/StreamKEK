// Runs in a stream's player frame. The multi-stream view keeps one stream's sound on at a time, so this
// mutes or unmutes the video when twitch/multi-view.js says to. On the video element, not the player,
// which would save it as your choice for the next stream. Does nothing in the normal stream view.
(() => {
  'use strict';

  const twitch = location.ancestorOrigins[0];
  if (!twitch?.endsWith('.twitch.tv')) return;

  const RECHECK_MS = 1000;

  // Null until the view has said, so the player is left alone. In the address to be silent from the
  // first sound, since a message would come too late.
  let muted = location.hash.includes('skek-muted') ? true : null;

  function apply() {
    if (muted === null) return;
    for (const video of document.querySelectorAll('video')) {
      if (video.muted !== muted) video.muted = muted;
    }
  }

  // A player can swap in a video that started before it joined the page, which no event here reports.
  setInterval(() => {
    if (muted) apply();
  }, RECHECK_MS);

  addEventListener('message', (event) => {
    if (event.source !== parent || typeof event.data?.skekMuted !== 'boolean') return;
    muted = event.data.skekMuted;
    apply();
  });

  // Media events don't bubble, so these need to be captured. A player starts up by setting mute itself,
  // which only counts as you choosing if it's after a click in this frame, on a video already playing:
  // then the view moves the sound here. Otherwise it's put back.
  document.addEventListener('loadstart', apply, true);
  document.addEventListener('play', apply, true);
  document.addEventListener('playing', apply, true);
  document.addEventListener(
    'volumechange',
    ({ target: video }) => {
      if (muted === null || video.muted === muted) return;
      if (navigator.userActivation?.isActive && !video.paused && video.currentTime > 1) {
        muted = video.muted;
        parent.postMessage({ skekFrame: 'audio', muted }, twitch);
      } else {
        video.muted = muted;
      }
    },
    true,
  );
})();
