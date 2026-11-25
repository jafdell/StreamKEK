// Picture-in-picture for a stream's player frame: the stream in a small window that stays on top of
// your other apps. For YouTube's and Kick's players in the stream view, and every player in the
// multi-stream view, Twitch's embedded one included. Twitch's own player has its button in
// player/picture-in-picture.js.
// The browser only opens the window after a click or key press it counts as this frame's, so the
// button has to be drawn in here. It sits at the middle of the player's right edge while the mouse
// moves: the Twitch page draws its own bars and buttons over the top of the player, and the site's
// controls are along the bottom.
// Alt+P reaches this frame as a message: layout-keys.js sends the key to the Twitch page, and
// twitch/view-layouts.js or multi-view.js sends it on. Pressed in this frame, the browser allows
// it. Pressed on the Twitch page, the browser refuses, so the button shows itself and asks for the
// click. multi-view.js is told when the window opens and closes, to know which stream has it.
(() => {
  'use strict';

  const twitch = location.ancestorOrigins[0];
  if (!twitch?.endsWith('.twitch.tv') || !document.pictureInPictureEnabled) return;

  const SHOW_MS = 3000;
  const ASK_MS = 5000;
  const MOVE_INTERVAL_MS = 500;
  const SVG = 'http://www.w3.org/2000/svg';
  // The same picture as pictureInPicture in src/twitch/helpers.js, which isn't loaded in frames.
  const ICON =
    'M3 4h14a1 1 0 0 1 1 1v6h-2V6H4v9h6v2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm10 9h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z';
  const LABELS = { enter: 'Picture-in-picture (Alt+P)', exit: 'Exit picture-in-picture (Alt+P)', ask: 'Click to pop out' };

  let button = null;
  let hideTimer = null;
  let lastMove = 0;

  const inWindow = () => !!document.pictureInPictureElement;

  // The stream: the biggest video with a picture. A player can keep a second, empty one.
  function mainVideo() {
    let best = null;
    let bestArea = 0;
    for (const video of document.querySelectorAll('video')) {
      if (video.disablePictureInPicture || !video.videoWidth) continue;
      const { width, height } = video.getBoundingClientRect();
      if (width * height > bestArea) {
        best = video;
        bestArea = width * height;
      }
    }
    return best;
  }

  function label() {
    if (!button) return;
    const text = button.classList.contains('skek-pip-button--ask') ? LABELS.ask : inWindow() ? LABELS.exit : LABELS.enter;
    button.dataset.skekLabel = text;
    button.ariaLabel = text;
    button.classList.toggle('skek-pip-button--on', inWindow());
  }

  function hide() {
    clearTimeout(hideTimer);
    button?.classList.remove('skek-pip-button--show', 'skek-pip-button--ask');
    label();
  }

  // The button has nothing left to ask for. It stays where it is, so a second click can't fall
  // through to the player under it.
  function stopAsking() {
    button?.classList.remove('skek-pip-button--ask');
    label();
  }

  // Beside <body>, where the site's own page doesn't reach, and built without innerHTML, which
  // YouTube's page refuses.
  function build() {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', ICON);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.append(path);
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'skek-pip-button';
    // Hidden most of the time, so not a stop for the Tab key.
    button.tabIndex = -1;
    button.append(svg);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggle(false);
      stopAsking();
    });
    // Keeps the keyboard with the player, for its own shortcuts.
    button.addEventListener('mousedown', (event) => event.preventDefault());
  }

  // `ask` is the button asking for the click itself.
  function show(ms, ask = false) {
    if (!inWindow() && !mainVideo()) {
      hide();
      return;
    }
    if (!button) build();
    if (!button.isConnected) document.documentElement.append(button);
    button.classList.add('skek-pip-button--show');
    button.classList.toggle('skek-pip-button--ask', ask);
    label();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (button.matches(':hover')) show(SHOW_MS);
      else hide();
    }, ms);
  }

  // `asked` is for a request from outside this frame, which the browser may refuse.
  function toggle(asked) {
    if (inWindow()) {
      document.exitPictureInPicture().catch(() => {});
      return;
    }
    const video = mainVideo();
    if (!video) return;
    video.requestPictureInPicture().catch((error) => {
      if (asked && error?.name === 'NotAllowedError') show(ASK_MS, true);
    });
  }

  // Captured, so a player that keeps the event to itself can't stop this hearing of it.
  addEventListener(
    'mousemove',
    () => {
      if (Date.now() - lastMove < MOVE_INTERVAL_MS) return;
      lastMove = Date.now();
      if (!button?.classList.contains('skek-pip-button--ask')) show(SHOW_MS);
    },
    true,
  );
  document.documentElement.addEventListener('mouseleave', () => {
    if (!button?.classList.contains('skek-pip-button--ask')) hide();
  });

  // On the video, and they bubble.
  function report() {
    stopAsking();
    parent.postMessage({ skekFrame: 'picture-in-picture', open: inWindow() }, twitch);
  }
  document.addEventListener('enterpictureinpicture', report, true);
  document.addEventListener('leavepictureinpicture', report, true);

  addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== twitch || event.data?.skekPictureInPicture !== 'toggle') return;
    toggle(true);
  });
})();
