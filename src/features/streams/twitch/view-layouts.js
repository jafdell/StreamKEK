// The stream view's theatre, stacked and floating chat modes. The same modes on Twitch's own player
// are in features/player/, and both use its floating window.
(() => {
  'use strict';

  const shared = skek.streams;
  const { state, syncChatFrame } = shared;

  const OVERLAY_MS = 3000;
  const LAYOUT_SHORTCUTS = { KeyT: 'theatre', KeyS: 'stacked', KeyC: 'floating' };

  let overlayTimer = null;

  // Like Twitch's overlay: the info bar shows over the video while the mouse is moving.
  function showOverlay() {
    if (!state.view?.layout) return;
    state.view.root.classList.add('skek-view--controls');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => state.view?.root.classList.remove('skek-view--controls'), OVERLAY_MS);
  }

  // These all fill the window, and only one can be on: null, 'theatre', 'stacked' or 'floating'.
  function setLayout(layout) {
    const { view } = state;
    view.layout = layout;
    view.root.classList.toggle('skek-view--full-window', !!layout);
    view.root.classList.toggle('skek-view--stacked', layout === 'stacked');
    view.root.classList.toggle('skek-view--floating', layout === 'floating');
    view.refs.theatreButton.ariaLabel = layout === 'theatre' ? 'Exit theatre mode' : 'Theatre mode';
    view.refs.stackedButton.ariaLabel = layout === 'stacked' ? 'Exit stacked mode' : 'Stacked mode';
    view.refs.floatingButton.ariaLabel = layout === 'floating' ? 'Exit floating chat' : 'Floating chat';
    if (layout === 'floating') skek.floatingWindow.open(() => setLayout(null));
    else skek.floatingWindow.close();
    syncChatFrame();
    if (layout) showOverlay();
    else view.root.classList.remove('skek-view--controls');
    shared.placeView();
  }

  function toggleLayout(layout) {
    setLayout(state.view.layout === layout ? null : layout);
  }

  // Captured first, so Alt+T doesn't also switch Twitch's own player behind the view.
  addEventListener(
    'keydown',
    (event) => {
      const { view } = state;
      if (!view) return;
      // Ctrl is left out because AltGr reports as Ctrl+Alt on Windows.
      const layout = event.altKey && !event.ctrlKey ? LAYOUT_SHORTCUTS[event.code] : null;
      if (!layout && !(event.key === 'Escape' && view.layout)) return;
      event.preventDefault();
      event.stopPropagation();
      if (layout) toggleLayout(layout);
      else setLayout(null);
    },
    true,
  );

  // The frames report the mouse and keys, which never reach this page while over them.
  addEventListener('message', (event) => {
    const { view } = state;
    if (!view || ![...view.root.querySelectorAll('iframe')].some((frame) => frame.contentWindow === event.source)) return;
    const message = event.data?.skekFrame;
    if (message === 'activity') showOverlay();
    else if (message === 'toggle-theatre') toggleLayout('theatre');
    else if (message === 'toggle-stacked') toggleLayout('stacked');
    else if (message === 'toggle-floating') toggleLayout('floating');
    else if (message === 'exit-theatre' && view.layout) setLayout(null);
  });

  Object.assign(shared, { showOverlay, toggleLayout });
})();
