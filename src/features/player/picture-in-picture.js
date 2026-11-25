// Picture-in-picture on Twitch's own player: the stream in a small window that stays on top of
// your other apps. This file is the button in the player controls and Alt+P.
// YouTube's and Kick's players, and every player in multi-stream, are in frames, where
// streams/frames/picture-in-picture.js has a button of its own, and streams/twitch/view-layouts.js
// and multi-view.js pass Alt+P on to it.
// The window is the browser's, so it holds the video and nothing else, and one window is all a
// browser shows at a time. background-quality.js keeps the quality up while it's open.
// data-skek-pip on <html> says this page's video is in the window, for picture-in-picture.css.
(() => {
  'use strict';

  const { onBodyReady, onPageChange } = skek.helpers;
  const { BUTTON_CLASS, theatreItems, buildButton } = skek.playerButtons;

  const PIP_CLASS = `${BUTTON_CLASS}--pip`;
  const MODE_BUTTON = '.skek-mode-button';
  const SHORTCUT = 'KeyP';
  const VIDEO = '.video-ref video';
  const root = document.documentElement;

  // Only ever this page's own video: one in a frame is that frame's.
  const inWindow = () => !!document.pictureInPictureElement;
  // Audio only has no picture to show.
  const audioOnly = () => root.dataset.skekAudioState === 'on';

  function leave() {
    if (inWindow()) document.exitPictureInPicture().catch(() => {});
  }

  // The browser refuses a video with nothing loaded yet, and that's fine.
  function toggle(video) {
    if (inWindow()) leave();
    else if (video && !audioOnly()) video.requestPictureInPicture().catch(() => {});
  }

  // The video of the player a button is in. Away from a channel's page there's no button, only
  // the small player.
  function videoFor(button) {
    return button?.closest('.video-player')?.querySelector(VIDEO) ?? document.querySelector(VIDEO);
  }

  function update() {
    const open = inWindow();
    root.toggleAttribute('data-skek-pip', open);
    const text = open ? 'Exit picture-in-picture' : 'Picture-in-picture';
    for (const button of document.querySelectorAll(`.${PIP_CLASS} button`)) {
      if (button.getAttribute('aria-label') !== text) button.setAttribute('aria-label', text);
    }
  }

  function addButtons() {
    // Only the player on a channel's page, which has chat beside it, not the front page's.
    if (!document.pictureInPictureEnabled || !document.querySelector('.right-column')) return;
    for (const theatre of theatreItems()) {
      const controls = theatre.parentElement;
      if (controls.querySelector(`:scope > .${PIP_CLASS}`)) continue;
      const button = buildButton(theatre, {
        classes: [PIP_CLASS],
        tooltip: 'StreamKEK (Alt+P)',
        icon: 'pictureInPicture',
        onClick: (event) => toggle(videoFor(event.currentTarget)),
      });
      // After audio only's button and before the modes', whichever was added first.
      (controls.querySelector(`:scope > ${MODE_BUTTON}`) ?? theatre).before(button);
    }
    update();
  }

  // The stream view and multi-stream pause Twitch's video behind them, which would leave the
  // window showing a still picture.
  function leaveBehindView() {
    if (document.getElementById('skek-view')) leave();
  }

  // isTrusted, as in modes.js, and because the browser only opens the window for a real key press.
  // The stream view and multi-stream have their own. Away from a channel's page there's no button,
  // but the small player can still be in the window, so the shortcut still closes it.
  // Ctrl is left out because AltGr reports as Ctrl+Alt on Windows.
  addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted || !event.altKey || event.ctrlKey || event.code !== SHORTCUT) return;
      if (document.getElementById('skek-view')) return;
      const button = document.querySelector(`.${PIP_CLASS}`);
      if (!inWindow() && (audioOnly() || !button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // The same video as the first button's, where a page has two players.
      toggle(videoFor(button));
    },
    true,
  );

  // On the video, and they bubble. Captured, so a player that keeps them to itself can't hide them.
  document.addEventListener('enterpictureinpicture', update, true);
  document.addEventListener('leavepictureinpicture', update, true);

  onBodyReady(() => {
    // Closed as soon as audio only is asked for, which audio-only.js marks with the first, so the
    // window doesn't show a still picture while the player switches. audio-only-player.js sets the
    // second, in the page itself, once it has.
    new MutationObserver(() => {
      if (root.hasAttribute('data-skek-audio-only') || audioOnly()) leave();
    }).observe(root, { attributeFilter: ['data-skek-audio-only', 'data-skek-audio-state'] });
    onPageChange(() => {
      addButtons();
      leaveBehindView();
    });
  });
})();
