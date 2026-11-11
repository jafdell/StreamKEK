// Stacked and floating chat modes on Twitch's own player. The stream view has its own in
// streams/twitch/view-layouts.js.
// Stacked: the stream full width on top with chat under it, for a narrow window.
// Floating chat: the stream fullscreen with chat in a window over it; see floating-window.js.
// Both are built on Twitch's theatre mode, which already covers the top bar and sidebar, and
// player/modes.css moves the player and chat. So theatre mode can't show alongside them: asking
// for it just removes what they added.
(() => {
  'use strict';

  const { onBodyReady, onPageChange } = skek.helpers;
  const { FULLSCREEN, controlItem, theatreItems, buildButton } = skek.playerButtons;

  // In the order they sit in the control bar, left to right.
  const MODES = {
    floating: { label: 'Floating chat', shortcut: 'KeyC', tooltip: 'StreamKEK (Alt+C)', icon: 'floating' },
    stacked: { label: 'Stacked mode', shortcut: 'KeyS', tooltip: 'StreamKEK (Alt+S)', icon: 'stacked' },
  };
  const BUTTON_CLASS = 'skek-mode-button';
  const COLLAPSE = '[data-a-target="right-column__toggle-collapse-btn"]';
  const root = document.documentElement;

  let mode = null;
  // Theatre mode can take a moment to start, so losing it only counts after it was seen on.
  let theatreSeen = false;

  const theatreOn = () => !!document.querySelector('.persistent-player--theatre');

  // Twitch's button has no name that isn't translated, but its shortcut is always Alt+T.
  function toggleTwitchTheatre() {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 't', code: 'KeyT', keyCode: 84, which: 84, altKey: true, bubbles: true, cancelable: true }),
    );
  }

  function updateButtons() {
    for (const [name, { label }] of Object.entries(MODES)) {
      const text = mode === name ? `Exit ${label.toLowerCase()}` : label;
      for (const button of document.querySelectorAll(`.${BUTTON_CLASS}--${name} button`)) button.setAttribute('aria-label', text);
    }
  }

  // Stores the mode without touching theatre mode, and starts or ends what only floating chat has.
  function applyMode(next) {
    mode = next;
    if (next) root.dataset.skekPlayerMode = next;
    else delete root.dataset.skekPlayerMode;
    if (next === 'floating') skek.floatingWindow.open(() => setMode(null));
    else skek.floatingWindow.close();
    updateButtons();
  }

  function setMode(next) {
    theatreSeen = false;
    // A collapsed chat would leave these modes with no chat to show.
    if (next && document.querySelector('.right-column--collapsed')) document.querySelector(COLLAPSE)?.click();
    if (!!next !== theatreOn()) toggleTwitchTheatre();
    applyMode(next);
  }

  const toggleMode = (name) => setMode(mode === name ? null : name);

  function addButtons() {
    // A player with no chat beside it, like the front page's, has no chat to move.
    if (!document.querySelector('.right-column')) return;
    for (const theatre of theatreItems()) {
      for (const [name, { tooltip, icon }] of Object.entries(MODES)) {
        if (theatre.parentElement.querySelector(`:scope > .${BUTTON_CLASS}--${name}`)) continue;
        const classes = [BUTTON_CLASS, `${BUTTON_CLASS}--${name}`];
        theatre.before(buildButton(theatre, { classes, tooltip, icon, onClick: () => toggleMode(name) }));
      }
    }
    updateButtons();
  }

  // Esc, and anything else that ends theatre mode, ends these modes too.
  function followTheatre() {
    if (!mode) return;
    if (theatreOn()) theatreSeen = true;
    else if (theatreSeen) setMode(null);
  }

  // Theatre mode is on already, so all that's left is to stop Twitch toggling it off.
  function leaveModeForTheatre(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    applyMode(null);
  }

  // isTrusted, because toggleTwitchTheatre's own key press comes through here too. The stream
  // view has its own shortcuts. Ctrl is left out because AltGr reports as Ctrl+Alt on Windows.
  addEventListener(
    'keydown',
    (event) => {
      if (!event.isTrusted || !event.altKey || event.ctrlKey || document.getElementById('skek-view')) return;
      const name = Object.keys(MODES).find((key) => MODES[key].shortcut === event.code);
      if (name && document.querySelector(`.${BUTTON_CLASS}`)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleMode(name);
      } else if (mode && event.code === 'KeyT') {
        leaveModeForTheatre(event);
      } else if (mode && event.code === 'KeyR') {
        // Twitch's shortcut for collapsing chat, which would leave these modes with none.
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  addEventListener(
    'click',
    (event) => {
      const button = mode && event.target.closest?.('button');
      if (button && controlItem(button).nextElementSibling?.querySelector(FULLSCREEN)) leaveModeForTheatre(event);
    },
    true,
  );

  onBodyReady(() => {
    onPageChange(() => {
      addButtons();
      followTheatre();
    });
  });
})();
