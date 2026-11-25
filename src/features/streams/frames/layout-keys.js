// The theatre, stacked, floating chat and picture-in-picture shortcuts, and Esc to leave the modes.
// Keys pressed inside YouTube's or Kick's player or chat stop at that frame, so this passes them to
// the Twitch page, where twitch/view-layouts.js handles them, and twitch/multi-view.js in
// multi-stream. Picture-in-picture's comes back to the player's frame, to picture-in-picture.js.
(() => {
  'use strict';

  const twitch = location.ancestorOrigins[0];
  if (!twitch?.endsWith('.twitch.tv')) return;

  const LAYOUT_SHORTCUTS = { KeyT: 'toggle-theatre', KeyS: 'toggle-stacked', KeyC: 'toggle-floating', KeyP: 'toggle-picture-in-picture' };

  addEventListener(
    'keydown',
    (event) => {
      // Ctrl is left out because AltGr reports as Ctrl+Alt on Windows.
      const shortcut = event.altKey && !event.ctrlKey ? LAYOUT_SHORTCUTS[event.code] : null;
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();
        parent.postMessage({ skekFrame: shortcut }, twitch);
      } else if (event.key === 'Escape' && !document.fullscreenElement) {
        parent.postMessage({ skekFrame: 'exit-theatre' }, twitch);
      }
    },
    true,
  );
})();
