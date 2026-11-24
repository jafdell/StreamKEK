// Tells twitch-effects.css when none of its motion could be seen, so it can stop: in fullscreen, in
// Twitch's theatre mode, and when the stream view or the multi-stream view fills the window. It puts
// data-skek-covered on <html> then.
(() => {
  'use strict';

  const { onBodyReady, onPageChange } = skek.helpers;

  const COVERED = 'data-skek-covered';
  // Twitch's player in theatre mode, and either view filling the window.
  const COVERING = '.persistent-player--theatre, .skek-view--full-window';
  // What those classes come and go on.
  const CHANGING = '.persistent-player, #skek-view';
  const root = document.documentElement;
  const watched = new WeakSet();

  function update() {
    const covered = !!document.fullscreenElement || !!document.querySelector(COVERING);
    if (root.hasAttribute(COVERED) !== covered) root.toggleAttribute(COVERED, covered);
  }

  // A class changing isn't a page change, so each of them is watched for it.
  const classWatcher = new MutationObserver(update);

  function watch() {
    for (const node of document.querySelectorAll(CHANGING)) {
      if (watched.has(node)) continue;
      watched.add(node);
      classWatcher.observe(node, { attributeFilter: ['class'] });
    }
    update();
  }

  onBodyReady(() => {
    watch();
    onPageChange(watch);
    document.addEventListener('fullscreenchange', update);
  });
})();
