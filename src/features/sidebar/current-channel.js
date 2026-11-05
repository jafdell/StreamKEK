// Highlights the Twitch channel you're watching in the sidebar, like the stream view does for its
// own cards in streams/twitch/sidebar.js. Twitch has no marker for this, so it goes by the address.
(() => {
  'use strict';

  const { onBodyReady, onPageChange } = skek.helpers;

  // Twitch's attributes on these cards are missing while the sidebar is collapsed, unlike the classes.
  const CARD = '[data-test-selector="side-nav"] .side-nav-card a[href]';
  const ATTRIBUTE = 'data-skek-current';
  // Only a channel's card has one part to its address. Categories have more, like /directory/category/x.
  const CHANNEL_PATH = /^\/(\w+)\/?$/;

  function render() {
    // The stream view's address, like /kick/<channel>, isn't a Twitch channel.
    const watching = document.getElementById('skek-view') ? null : location.pathname.split('/')[1]?.toLowerCase();
    for (const card of document.querySelectorAll(CARD)) {
      const channel = card.pathname.match(CHANNEL_PATH)?.[1].toLowerCase();
      const current = !!channel && channel === watching;
      if (card.hasAttribute(ATTRIBUTE) !== current) card.toggleAttribute(ATTRIBUTE, current);
    }
  }

  onBodyReady(() => {
    render();
    onPageChange(render);
  });
})();
