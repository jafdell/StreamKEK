// The channel manager page, framed in place beside the button that opened it.
(() => {
  'use strict';

  const { el } = skek.helpers;

  // The frame's size in manager-frame.css plus an 8px margin.
  const FRAME_WIDTH_WITH_MARGIN = 348;
  const FRAME_HEIGHT_WITH_MARGIN = 468;

  let manager = null;

  function closeManager(event) {
    // The button's own click handles closing, or it would just reopen.
    if (event?.target?.closest?.('.skek-manager-toggle')) return;
    manager?.remove();
    manager = null;
    document.removeEventListener('mousedown', closeManager);
  }

  function toggleManager(event) {
    event.stopPropagation();
    if (manager) return closeManager();
    const rect = event.currentTarget.getBoundingClientRect();
    manager = el('iframe', {
      class: 'skek-manager',
      title: 'Manage channels',
      src: chrome.runtime.getURL('src/features/streams/manager/manager.html'),
    });
    manager.style.left = `${Math.min(rect.right + 8, innerWidth - FRAME_WIDTH_WITH_MARGIN)}px`;
    manager.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - FRAME_HEIGHT_WITH_MARGIN))}px`;
    document.body.append(manager);
    document.addEventListener('mousedown', closeManager);
  }

  Object.assign(skek.streams, { toggleManager });
})();
