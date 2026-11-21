// Runs in a site's player frame. The info bar on the Twitch page shows while the mouse moves, and so
// do the multi-stream view's bars in fullscreen. The mouse stops at this frame, so this passes it on
// to twitch/view-layouts.js and twitch/multi-view.js.
(() => {
  'use strict';

  const twitch = location.ancestorOrigins[0];
  if (!twitch?.endsWith('.twitch.tv')) return;

  const ACTIVITY_INTERVAL_MS = 500;
  let lastActivity = 0;
  // Captured, so a player that keeps the event to itself can't stop this hearing of it.
  addEventListener(
    'mousemove',
    () => {
      if (Date.now() - lastActivity < ACTIVITY_INTERVAL_MS) return;
      lastActivity = Date.now();
      parent.postMessage({ skekFrame: 'activity' }, twitch);
    },
    true,
  );
})();
