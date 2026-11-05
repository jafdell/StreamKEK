// Runs in a site's player frame. The info bar on the Twitch page shows while the mouse moves, which
// stops at this frame, so this passes it on to twitch/view-layouts.js.
(() => {
  'use strict';

  const twitch = location.ancestorOrigins[0];
  if (!twitch?.endsWith('.twitch.tv')) return;

  const ACTIVITY_INTERVAL_MS = 500;
  let lastActivity = 0;
  addEventListener('mousemove', () => {
    if (Date.now() - lastActivity < ACTIVITY_INTERVAL_MS) return;
    lastActivity = Date.now();
    parent.postMessage({ skekFrame: 'activity' }, twitch);
  });
})();
