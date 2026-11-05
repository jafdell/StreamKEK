// A still image of the stream when hovering a live Twitch channel in the sidebar, under Twitch's
// own title balloon. YouTube channels show theirs inside their tip, in streams/twitch/stream-tip.js.
(() => {
  'use strict';

  const { el, onBodyReady, onPageChange } = skek.helpers;

  // Twitch's attributes on these cards are missing while the sidebar is collapsed, unlike the classes.
  const CARD = '[data-test-selector="side-nav"] .side-nav-card a[href]';
  const SPACING = 8;
  const GAP = 4;
  // How long to wait for Twitch's balloon, so the image doesn't have to jump out of its way.
  const BALLOON_WAIT = 500;
  const BALLOON_CHECK = 50;

  let anchor = null;
  let box = null;
  let waiting = null;

  // Null for the sidebar's cards that aren't channels, like Recommended Categories.
  function previewUrl(card) {
    const login = new URL(card.href).pathname.slice(1).toLowerCase();
    return /^\w+$/.test(login) ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-440x248.jpg` : null;
  }

  // Offline channels only have a placeholder image.
  function isLive(card) {
    return !card.querySelector("[class*='side-nav-card__avatar--offline']");
  }

  // Twitch's balloon has no attribute to find it by, only its place beside the card. If this ever
  // misses, the image opens right under the card instead and the balloon stays on top of it.
  function findBalloon() {
    const card = anchor.getBoundingClientRect();
    return [...document.querySelectorAll('.tw-dialog-layer *')]
      .map((node) => node.getBoundingClientRect())
      .find((r) => r.height > 1 && r.left >= card.right - 1 && r.left <= card.right + SPACING && r.top < card.bottom && r.bottom > card.top);
  }

  // Under the balloon, or over it when the card is too near the bottom of the window.
  function place() {
    const card = anchor.getBoundingClientRect();
    const above = findBalloon() ?? card;
    const below = above.bottom + GAP;
    const fits = below + box.offsetHeight + SPACING <= innerHeight;
    box.style.left = `${card.right + SPACING}px`;
    box.style.top = `${fits ? below : Math.max(SPACING, above.top - GAP - box.offsetHeight)}px`;
  }

  function open(url) {
    box = el(
      'div',
      { class: 'skek-preview' },
      el('img', { class: 'skek-preview-img', src: url, alt: '', referrerPolicy: 'no-referrer', on: { error: hide } }),
    );
    document.body.append(box);
    place();
  }

  function show(card) {
    hide();
    const url = previewUrl(card);
    if (!url) return;
    anchor = card;
    const started = Date.now();
    waiting = setInterval(() => {
      if (!findBalloon() && Date.now() - started < BALLOON_WAIT) return;
      clearInterval(waiting);
      open(url);
    }, BALLOON_CHECK);
  }

  function hide() {
    clearInterval(waiting);
    box?.remove();
    box = null;
    anchor = null;
  }

  // Twitch can replace or move a card under a mouse that isn't moving.
  function check() {
    if (!anchor) return;
    if (!anchor.isConnected || !anchor.matches(':hover')) hide();
    else if (box) place();
  }

  onBodyReady(() => {
    document.addEventListener('mouseover', (event) => {
      const card = event.target.closest(CARD);
      if (card === anchor) return;
      if (card && isLive(card)) show(card);
      else hide();
    });
    document.documentElement.addEventListener('mouseleave', hide);
    document.addEventListener('click', hide, true);
    // Chat scrolls all the time, so only the sidebar's own scrolling counts.
    addEventListener('scroll', (event) => {
      if (anchor && event.target.contains?.(anchor)) hide();
    }, true);
    onPageChange(check);
  });
})();
