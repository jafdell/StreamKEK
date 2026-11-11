// The Stream quality setting, for Twitch's player. YouTube's is in youtube/frames/watch-start.js
// and Kick's in kick/frames/watch-start.js.
// Applied when a stream starts or the setting changes, so the player's own quality menu still
// works afterwards. Twitch's saved quality is left alone: it ignores a size the stream doesn't
// offer, so it can't fall back to the next one down. Runs in the page itself, because reaching
// the player means going through React's internals. src/twitch/page-sync.js sets the attribute.
// Also runs in Twitch's embedded player, player.twitch.tv, for the multi-stream view, where
// embed-quality.js sets it. The player is found the same way there.
(() => {
  'use strict';

  // Twitch's embedded player on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const CHECK_MS = 1000;

  let applied = '';

  function findPlayer() {
    const element = document.querySelector('.video-ref');
    const fiberKey = element && Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    for (let fiber = element?.[fiberKey]; fiber; fiber = fiber.return) {
      const player = fiber.memoizedProps?.mediaPlayerInstance;
      if (player?.getQualities) return player;
    }
    return null;
  }

  function applyQuality(player, qualities, setting) {
    if (setting === 'auto') {
      player.setAutoQualityMode(true);
      return;
    }
    // Best first. Audio only has no height.
    const quality = qualities.find((q) => q.height > 0 && q.height <= Number(setting));
    if (!quality) return;
    player.setAutoQualityMode(false);
    player.setQuality(quality);
  }

  setInterval(() => {
    const setting = document.documentElement.dataset.skekQuality;
    const player = setting && findPlayer();
    const qualities = player?.getQualities();
    if (!qualities?.length) return;

    const current = [setting, location.pathname, ...qualities.map((q) => q.group)].join(' ');
    if (current === applied) return;
    applied = current;
    applyQuality(player, qualities, setting);
  }, CHECK_MS);
})();
