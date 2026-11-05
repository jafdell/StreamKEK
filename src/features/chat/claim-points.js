// The Auto-claim channel points setting. Presses Twitch's own claim button, which only exists for
// the channel on screen, and only in a tab whose stream is playing: not a paused stream, and not
// a Twitch tab that's showing a YouTube stream, where Twitch's video is paused.
(() => {
  'use strict';

  const CHECK_MS = 5000;

  setInterval(() => {
    if (!document.documentElement.matches("[data-skek-on~='autoClaimPoints']")) return;
    const button = document.querySelector('.community-points-summary .claimable-bonus__icon')?.closest('button');
    const video = document.querySelector('video');
    if (button && video && !video.paused) button.click();
  }, CHECK_MS);
})();
