// Dragging a channel out of Twitch's sidebar, for whatever can take one: Favorites (favorites.js) and
// the multi-stream view (multi-view.js). Each registers a target with:
//   accepts(event, channel)  whether this spot would take it, also asked as the mouse moves
//   drop(event, channel)     it was dropped here
//   mark(event, channel), clearMarks()  optional, to show where it would land
//   start(channel), end()    optional, for when a drag begins and ends
(() => {
  'use strict';

  const shared = skek.streams;
  const { onBodyReady } = skek.helpers;
  const { state } = shared;

  // Twitch's attributes on these cards are missing while the sidebar is collapsed, unlike the classes.
  const TWITCH_CARD = '[data-test-selector="side-nav"] .side-nav-card a[href]';
  const OUR_CARD = '.skek-card[data-skek-channel]';
  // Only a channel's card has one part to its address. Categories have more, like /directory/category/x.
  const CHANNEL_PATH = /^\/(\w+)\/?$/;
  const DRAGGING = 'data-skek-dragging';

  const targets = [];
  let dragged = null;

  function twitchCardChannel(link) {
    const login = link.pathname.match(CHANNEL_PATH)?.[1].toLowerCase();
    if (!login) return null;
    const id = `twitch:${login}`;
    // Not side-nav-title, which a card for several streamers together doesn't have.
    const name = link.querySelector('[data-a-target="side-nav-card-metadata"] [title]')?.title || login;
    return state.favorites.find((c) => c.id === id) ?? { id, platform: 'twitch', login, name, avatar: link.querySelector('img')?.src ?? '' };
  }

  function draggedChannel(target) {
    const ours = target.closest?.(OUR_CARD);
    if (ours) {
      const id = ours.dataset.skekChannel;
      return state.favorites.find((c) => c.id === id) ?? state.channels.find((c) => c.id === id) ?? null;
    }
    const link = target.closest?.(TWITCH_CARD);
    return link ? twitchCardChannel(link) : null;
  }

  function clearMarks() {
    for (const target of targets) target.clearMarks?.();
  }

  const targetFor = (event) => targets.find((target) => target.accepts(event, dragged));

  function onDragStart(event) {
    const channel = draggedChannel(event.target);
    if (!channel) return;
    dragged = channel;
    shared.hideTip();
    const card = event.target.closest(`${OUR_CARD}, .side-nav-card`);
    const { left, top } = card.getBoundingClientRect();
    // Otherwise the browser drags the link's address, or only the avatar.
    event.dataTransfer.setDragImage(card, event.clientX - left, event.clientY - top);
    event.dataTransfer.effectAllowed = 'all';
    // The browser cancels a drag if the page changes while it's starting.
    setTimeout(() => {
      if (!dragged) return;
      document.documentElement.toggleAttribute(DRAGGING, true);
      for (const target of targets) target.start?.(dragged);
    });
  }

  function onDragOver(event) {
    if (!dragged) return;
    clearMarks();
    const target = targetFor(event);
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    target.mark?.(event, dragged);
  }

  function endDrag() {
    if (!dragged) return;
    dragged = null;
    document.documentElement.removeAttribute(DRAGGING);
    clearMarks();
    for (const target of targets) target.end?.();
    shared.renderSidebar();
  }

  function onDrop(event) {
    if (!dragged) return;
    const target = targetFor(event);
    if (target) {
      event.preventDefault();
      target.drop(event, dragged);
    }
    endDrag();
  }

  onBodyReady(() => {
    document.addEventListener('dragstart', onDragStart, true);
    // The browser asks with dragenter on reaching an element, and only with dragover after that,
    // so a quick drop is refused unless both say yes.
    document.addEventListener('dragenter', onDragOver, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', endDrag, true);
    // A card Twitch replaced mid-drag never reports dragend, and the mouse doesn't move during a drag.
    document.addEventListener('mousemove', endDrag, true);
  });

  Object.assign(shared, {
    TWITCH_CARD,
    CHANNEL_PATH,
    twitchCardChannel,
    registerDropTarget: (target) => targets.push(target),
    isDragging: () => !!dragged,
  });
})();
