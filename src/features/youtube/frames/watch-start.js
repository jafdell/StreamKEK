// Sets a stream up once it starts inside Twitch: the Stream quality setting, and live instead
// of the stream's beginning. Only done once, or when the setting changes, so the player's own
// quality menu and rewinding still work afterwards. Runs in the page itself to reach YouTube's
// player. watch.js sets the attribute. Twitch's player is in features/stream-quality/.
(() => {
  'use strict';

  if (window === window.top || !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const PLAYING = 1;
  const PAUSED = 2;
  const CLOSE_ENOUGH_TO_LIVE_SECONDS = 60;
  const QUALITIES_BEST_FIRST = ['hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  // Every streamQuality choice in src/settings.js needs an entry here, or YouTube silently drops
  // to its lowest quality.
  const HIGHEST_FOR_SETTING = { 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium' };

  const root = document.documentElement;

  function applyQuality(player) {
    const setting = root.dataset.skekQuality;
    if (setting === 'auto') {
      player.setPlaybackQualityRange('auto', 'auto');
      return;
    }
    const allowed = QUALITIES_BEST_FIRST.slice(QUALITIES_BEST_FIRST.indexOf(HIGHEST_FOR_SETTING[setting]));
    const available = player.getAvailableQualityLevels();
    const quality = allowed.find((level) => available.includes(level));
    if (quality) player.setPlaybackQualityRange(quality, quality);
  }

  const timer = setInterval(() => {
    const player = document.getElementById('movie_player');
    const state = player?.getPlayerState?.();
    if ((state !== PLAYING && state !== PAUSED) || player.classList.contains('ad-showing')) return;
    if (!root.dataset.skekQuality) return;

    // Does nothing, rather than throwing ten times a second, if YouTube renames these.
    const { current, seekableEnd } = player.getProgressState?.() ?? {};
    if (!seekableEnd || !player.getAvailableQualityLevels?.()?.length) return;
    clearInterval(timer);

    applyQuality(player);
    if (seekableEnd - current > CLOSE_ENOUGH_TO_LIVE_SECONDS) player.seekToLiveHead();
    new MutationObserver(() => applyQuality(player)).observe(root, { attributeFilter: ['data-skek-quality'] });
  }, 100);
})();
