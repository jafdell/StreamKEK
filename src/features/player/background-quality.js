// The Keep quality in background tabs setting, for Twitch's player. About a minute after its tab
// is hidden, Twitch's player drops a live stream to 360p, whatever quality was chosen, and takes
// some seconds to come back from it. Twitch's page tells the player each time the tab is hidden
// or shown, so this tells the player it's shown, right after. Only the player hears that: the
// rest of the page still knows the tab is hidden.
// Runs in the page itself, because reaching the player means going through React's internals, as
// quality.js does. src/twitch/page-sync.js sets the attribute, and embed-settings.js does in
// Twitch's embedded player, for the multi-stream view.
(() => {
  'use strict';

  // Twitch's embedded player on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const AGAIN_MS = 5000;
  const ON = "[data-skek-on~='keepBackgroundQuality'], [data-skek-keep-quality]";

  // The same way quality.js finds it.
  function findPlayer() {
    const element = document.querySelector('.video-ref');
    const fiberKey = element && Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    for (let fiber = element?.[fiberKey]; fiber; fiber = fiber.return) {
      const player = fiber.memoizedProps?.mediaPlayerInstance;
      if (player?.setVisible) return player;
    }
    return null;
  }

  function keep() {
    if (!document.hidden || !document.documentElement.matches(ON)) return;
    try {
      findPlayer()?.setVisible(true);
    } catch {
      // Twitch changed its player. Nothing to do.
    }
  }

  // On window, which hears of it after document does, where Twitch's player listens.
  addEventListener('visibilitychange', keep);
  // And every few seconds, for a player that starts in a hidden tab: it's told so as it starts.
  setInterval(keep, AGAIN_MS);
})();
