// The buttons StreamKEK adds to Twitch's player controls. modes.js, audio-only.js and
// picture-in-picture.js each add their own with this, beside theatre mode's, and volume-boost.js
// adds its beside the volume.
(() => {
  'use strict';

  const { icon } = skek.helpers;

  const BUTTON_CLASS = 'skek-player-button';
  const FULLSCREEN = '[data-a-target="player-fullscreen-button"]';

  // The control-bar item a button sits in: the wrapper that has its neighbours beside it.
  function controlItem(node) {
    let item = node;
    while (item.parentElement && item.parentElement.children.length < 3) item = item.parentElement;
    return item;
  }

  // Theatre's button in each player's controls. It's the one with nothing to identify it but its
  // place before fullscreen's. It's the one to copy, too, and to add buttons before: other
  // extensions add theirs beside fullscreen's.
  function theatreItems() {
    return [...document.querySelectorAll(FULLSCREEN)]
      .map((fullscreen) => controlItem(fullscreen).previousElementSibling)
      .filter((item) => item?.querySelector('button'));
  }

  // A copy of theatre's button with another icon. `classes` are added to its control-bar item.
  function buildButton(theatre, { classes, tooltip, icon: iconName, onClick }) {
    const item = theatre.cloneNode(true);
    item.classList.add(BUTTON_CLASS, ...classes);
    // On the wrapper, because Twitch's button clips what's outside it.
    item.dataset.skekTooltip = tooltip;
    const button = item.querySelector('button');
    const svg = icon(iconName).firstElementChild;
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    button.querySelector('svg').replaceWith(svg);
    button.addEventListener('click', onClick);
    return item;
  }

  skek.playerButtons = { BUTTON_CLASS, FULLSCREEN, controlItem, theatreItems, buildButton };
})();
