// After a first install, points out the extension's button in Twitch's top bar, once: in the first
// Twitch tab that's in view with the button showing. The background sets buttonIntro on a first
// install only (background/first-install.js), and this sets buttonIntroSeen as soon as it shows, so
// no other tab, page or update shows it again. Since it's shown only that once, it can be loud: it
// dims the page except a hole around the button, which stays clickable, and stays until it's
// closed or the button is clicked.
(() => {
  'use strict';

  const { el, onBodyReady, onPageChange } = skek.helpers;

  const BUTTON_ID = 'skek-settings-button';
  const HOLE = 28; // the radius of the hole around the button
  const GAP = 14; // between the hole and the callout, which its arrow fills
  const EDGE = 8; // kept clear at the window's edges

  let wanted = false;
  let layer = null;
  let backdrop = null;
  let ring = null;
  let callout = null;
  let placed = '';

  function close() {
    layer?.remove();
    layer = backdrop = ring = callout = null;
    placed = '';
    removeEventListener('resize', place);
  }

  // The hole and the ring on the button's middle, the callout under them. Twitch can rebuild its
  // top bar, which brings a new button, and hides it in theatre mode, which hides all this until
  // it's back.
  function place() {
    if (!layer) return;
    const rect = document.getElementById(BUTTON_ID)?.getBoundingClientRect();
    if (!rect?.width) {
      layer.hidden = true;
      placed = '';
      return;
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const signature = `${x},${y},${innerWidth},${innerHeight}`;
    if (signature === placed) return;
    placed = signature;
    layer.hidden = false;
    // The page, less a circle: clicks in the circle reach the button under it.
    backdrop.style.clipPath = `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${x - HOLE} ${y}a${HOLE} ${HOLE} 0 1 0 ${2 * HOLE} 0a${HOLE} ${HOLE} 0 1 0 ${-2 * HOLE} 0Z")`;
    ring.style.left = `${x - HOLE}px`;
    ring.style.top = `${y - HOLE}px`;
    const width = callout.offsetWidth;
    const left = Math.max(EDGE, Math.min(x - width + 36, innerWidth - width - EDGE));
    callout.style.left = `${left}px`;
    callout.style.top = `${y + HOLE + GAP}px`;
    callout.style.setProperty('--skek-intro-arrow', `${Math.max(20, Math.min(x - left, width - 20))}px`);
  }

  function show() {
    wanted = false;
    chrome.storage.local.set({ buttonIntroSeen: true });
    backdrop = el('div', { class: 'skek-intro__backdrop', on: { mousedown: close } });
    ring = el('div', { class: 'skek-intro__ring' });
    callout = el(
      'div',
      { class: 'skek-intro__callout', role: 'dialog', ariaLabel: 'StreamKEK' },
      el('img', { class: 'skek-intro__logo', src: chrome.runtime.getURL('icons/48.png'), alt: '' }),
      el(
        'div',
        {},
        el('p', { class: 'skek-intro__title' }, 'StreamKEK lives here'),
        el('p', { class: 'skek-intro__text' }, 'Click it for all its settings.'),
      ),
      el('button', { class: 'skek-intro__done', type: 'button', on: { click: close } }, 'Got it'),
    );
    layer = el('div', { class: 'skek-intro' }, backdrop, ring, callout);
    document.body.append(layer);
    addEventListener('resize', place);
    place();
  }

  // Cheap once it's been shown or isn't wanted, since onPageChange runs it often.
  function update() {
    if (layer) place();
    else if (wanted && document.visibilityState === 'visible' && document.getElementById(BUTTON_ID)?.getBoundingClientRect().width) show();
  }

  // Clicking the button opens the settings window, which is what this points to.
  addEventListener(
    'click',
    (event) => {
      if (layer && event.target.closest?.(`#${BUTTON_ID}`)) close();
    },
    true,
  );
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('visibilitychange', update);

  // Another tab showed it first.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.buttonIntroSeen?.newValue) wanted = false;
  });

  onBodyReady(() => {
    chrome.storage.local.get({ buttonIntro: false, buttonIntroSeen: false }).then(({ buttonIntro, buttonIntroSeen }) => {
      if (!buttonIntro || buttonIntroSeen) return;
      wanted = true;
      update();
      onPageChange(update); // the top bar can arrive after the body
    });
  });
})();
