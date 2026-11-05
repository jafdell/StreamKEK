// The extension's button in Twitch's top bar, and the window it opens. What's inside the window is an
// extension page, src/settings-window/, which is also the toolbar popup.
(() => {
  'use strict';

  const { el, onBodyReady, onPageChange } = skek.helpers;

  const BUTTON_ID = 'skek-settings-button';

  let overlay = null;
  let settingsFrame = null;

  function closeWindow() {
    overlay?.remove();
    overlay = null;
    settingsFrame = null;
  }

  function openWindow() {
    settingsFrame = el('iframe', {
      class: 'skek-settings-window',
      title: 'StreamKEK settings',
      src: chrome.runtime.getURL('src/settings-window/settings-window.html'),
    });
    // So the search box inside can take typing straight away.
    settingsFrame.addEventListener('load', () => settingsFrame?.focus());
    overlay = el(
      'div',
      {
        class: 'skek-settings-overlay',
        on: {
          mousedown: (event) => {
            if (event.target === overlay) closeWindow();
          },
        },
      },
      settingsFrame,
    );
    document.body.append(overlay);
  }

  // The first child of the group of buttons at the right end of the top bar.
  function placeButton() {
    if (document.getElementById(BUTTON_ID)) return;
    document.querySelector('.top-nav__menu')?.lastElementChild?.prepend(
      el(
        'button',
        {
          id: BUTTON_ID,
          class: 'skek-iconbtn',
          type: 'button',
          ariaLabel: 'StreamKEK settings',
          on: { click: openWindow },
        },
        el('img', { src: chrome.runtime.getURL('icons/48.png'), alt: '' }),
      ),
    );
  }

  // Sent by the window's close button and by Escape while focus is inside it.
  addEventListener('message', (event) => {
    if (settingsFrame && event.source === settingsFrame.contentWindow && event.data?.skekSettings === 'close') closeWindow();
  });
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeWindow();
  });

  onBodyReady(() => {
    placeButton();
    onPageChange(placeButton); // Twitch can rebuild its top bar
  });
})();
