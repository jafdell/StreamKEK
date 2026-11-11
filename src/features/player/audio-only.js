// Audio only on Twitch's own player: the sound of a live stream or a Twitch video with no
// picture, which the browser then neither downloads nor decodes. This file is the button in the
// player controls and Alt+A. audio-only-player.js, in the page itself, switches the player.
// They talk through <html>:
// data-skek-audio-only asks for audio, and data-skek-audio-state is the player's answer, 'off'
// where it could switch and 'on' while it plays audio. audio-only.css shows the button only
// where there's an answer.
(() => {
  'use strict';

  const { onBodyReady, onPageChange } = skek.helpers;
  const { BUTTON_CLASS, theatreItems, buildButton } = skek.playerButtons;

  const AUDIO_CLASS = `${BUTTON_CLASS}--audio`;
  const SHORTCUT = 'KeyA';
  const root = document.documentElement;

  const wanted = () => root.hasAttribute('data-skek-audio-only');

  function updateButtons() {
    const text = wanted() ? 'Exit audio only' : 'Audio only';
    for (const button of document.querySelectorAll(`.${AUDIO_CLASS} button`)) {
      if (button.getAttribute('aria-label') !== text) button.setAttribute('aria-label', text);
    }
  }

  function toggle() {
    root.toggleAttribute('data-skek-audio-only');
    updateButtons();
  }

  function addButtons() {
    // Only the player on a channel's page, which has chat beside it, not the front page's.
    if (!document.querySelector('.right-column')) return;
    for (const theatre of theatreItems()) {
      const controls = theatre.parentElement;
      if (controls.querySelector(`:scope > .${AUDIO_CLASS}`)) continue;
      const button = buildButton(theatre, {
        classes: [AUDIO_CLASS],
        tooltip: 'StreamKEK (Alt+A)',
        icon: 'headphones',
        onClick: toggle,
      });
      // First of StreamKEK's buttons, whichever was added first.
      (controls.querySelector(`:scope > .${BUTTON_CLASS}`) ?? theatre).before(button);
    }
    updateButtons();
  }

  // isTrusted, as in modes.js. Does nothing behind the stream view, or where the player can't
  // switch. Ctrl is left out because AltGr reports as Ctrl+Alt on Windows.
  addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted || !event.altKey || event.ctrlKey || event.code !== SHORTCUT) return;
      if (document.getElementById('skek-view') || !document.querySelector(`.${AUDIO_CLASS}`)) return;
      if (!wanted() && !root.hasAttribute('data-skek-audio-state')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle();
    },
    true,
  );

  onBodyReady(() => {
    // audio-only-player.js takes the request back when the stream has no audio-only version.
    new MutationObserver(updateButtons).observe(root, { attributeFilter: ['data-skek-audio-only'] });
    onPageChange(addButtons);
  });
})();
