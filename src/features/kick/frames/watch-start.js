// The Stream quality setting, for Kick's player in the stream view. Twitch's is in
// features/player/. Picks the best size at or under the setting when a stream starts or the
// setting changes, so the player's own quality menu still works afterwards. Kick's saved quality is
// left alone: it only knows some sizes by name, and goes back to Automatic for the others. Also
// starts each player at the volume you last chose, since Kick always starts at 50%, leaving a muted
// one muted, since browsers can pause a video that's unmuted without a click. Runs in the page itself,
// because reaching the player means going through React's internals, and does nothing if Kick changes
// them. watch.js sets the attributes, and saves data-skek-volume when this changes it.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const CHECK_MS = 1000;
  const SLIDER_UPDATE_MS = 50;

  const root = document.documentElement;
  let player = null;
  let applied = '';

  const isPlaying = (candidate) => candidate?.getQualities && candidate.getState?.() === 'Playing';

  // The player isn't above the video in React's tree, so this searches all of it. It only runs
  // until it finds the player. There's a second, idle player on the page, for hover previews.
  function findPlayer() {
    const element = document.querySelector('#injected-channel-player');
    const fiberKey = element && Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    let root = element?.[fiberKey];
    while (root?.return) root = root.return;

    const stack = root ? [root] : [];
    while (stack.length) {
      const fiber = stack.pop();
      for (let hook = fiber.memoizedState; hook && typeof hook === 'object' && 'next' in hook; hook = hook.next) {
        const value = hook.memoizedState;
        for (const candidate of [value, value?.current, value?.current?.value]) {
          if (isPlaying(candidate)) return candidate;
        }
      }
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return null;
  }

  // Once per player, so a volume you choose afterwards stays. Kick's slider only reads the volume
  // again when mute changes, and not if it changes straight back. A muted stream needs nothing more,
  // since unmuting it does that.
  function startAtSavedVolume(found) {
    found.setVolume(Number(root.dataset.skekVolume));
    if (found.isMuted()) return;
    found.setMuted(true);
    setTimeout(() => found.setMuted(false), SLIDER_UPDATE_MS);
  }

  // From the player, not the video element, which reads 0 and fires no event while muted. A volume of
  // 0 isn't kept, so the next stream doesn't start silent with its slider at the bottom.
  function rememberVolume() {
    const volume = Math.round(player.getVolume() * 100) / 100;
    if (volume > 0 && volume !== Number(root.dataset.skekVolume)) root.dataset.skekVolume = volume;
  }

  function applyQuality(qualities, setting) {
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
    const setting = root.dataset.skekQuality;
    if (!setting) return;
    if (!isPlaying(player)) {
      const found = findPlayer();
      if (!found) return;
      if (found !== player) {
        applied = '';
        startAtSavedVolume(found);
      }
      player = found;
    }
    rememberVolume();
    const qualities = player.getQualities();
    if (!qualities?.length) return;

    // The session changes when the player reconnects, which puts it back on Automatic. Choosing
    // a size in the player's own menu doesn't change anything here, so that choice stays.
    const current = [setting, player.getSessionId?.(), ...qualities.map((q) => q.group)].join(' ');
    if (current === applied) return;
    applied = current;
    applyQuality(qualities, setting);
  }, CHECK_MS);
})();
