// The stream view's theatre, stacked and floating chat modes. The same modes on Twitch's own player
// are in features/player/, and both use its floating window. Also Alt+P for picture-in-picture,
// which only the player's frame can open: see frames/picture-in-picture.js.
(() => {
  'use strict';

  const shared = skek.streams;
  const { state, syncChatFrame } = shared;

  const OVERLAY_MS = 3000;
  const LAYOUT_SHORTCUTS = { KeyT: 'theatre', KeyS: 'stacked', KeyC: 'floating' };
  const PICTURE_IN_PICTURE_SHORTCUT = 'KeyP';

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

  // Asks a player's frame to open or close its picture-in-picture window. For multi-view.js too.
  function askPictureInPicture(frame) {
    if (frame?.contentWindow) frame.contentWindow.postMessage({ skekPictureInPicture: 'toggle' }, new URL(frame.src).origin);
  }

  const playerFrame = () => state.view?.root.querySelector('.skek-player__frame');

  // Captured first, so Alt+T doesn't also switch Twitch's own player behind the view.
  addEventListener(
    'keydown',
    (event) => {
      const { view } = state;
      if (!view) return;
      // Ctrl is left out because AltGr reports as Ctrl+Alt on Windows.
      const alt = event.altKey && !event.ctrlKey;
      const layout = alt ? LAYOUT_SHORTCUTS[event.code] : null;
      const pictureInPicture = alt && event.code === PICTURE_IN_PICTURE_SHORTCUT;
      if (!layout && !pictureInPicture && !(event.key === 'Escape' && view.layout)) return;
      event.preventDefault();
      event.stopPropagation();
      if (layout) toggleLayout(layout);
      else if (pictureInPicture) askPictureInPicture(playerFrame());
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
    else if (message === 'toggle-picture-in-picture') askPictureInPicture(playerFrame());
    else if (message === 'exit-theatre' && view.layout) setLayout(null);
  });

  Object.assign(shared, { showOverlay, toggleLayout, askPictureInPicture });
})();
