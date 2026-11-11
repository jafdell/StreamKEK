// The See deleted messages setting, in Twitch's live chat. When a moderator deletes a message, or
// times out or bans its chatter, Twitch takes the message's text out of its line and puts a notice
// there instead. This puts that same text back and marks the line, and deleted-messages.css hides
// the notice and shows the text as deleted.
// Only the text Twitch just took out is used, so nothing is saved, and if Twitch's markup changes,
// chat just shows the notice as usual. A message deleted before it reached chat was never here.
(() => {
  'use strict';

  // Twitch's chat, also in the multi-stream view's frames, but not in that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const ON = "[data-skek-on~='showDeletedMessages']";
  const LINE = "[data-a-target='chat-line-message']";
  const BODY = "[data-a-target='chat-line-message-body']";
  const NOTICE = "[data-a-target='chat-deleted-message-placeholder']";
  const root = document.documentElement;

  let watching = false;

  // Twitch removes the text and adds the notice in the same place, one right after the other.
  function keep(records) {
    const texts = new Map();
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(BODY)) texts.set(record.target, node);
      }
    }
    if (!texts.size) return;
    for (const record of records) {
      const text = texts.get(record.target);
      if (!text) continue;
      for (const notice of record.addedNodes) {
        if (notice.nodeType !== Node.ELEMENT_NODE || !notice.matches(NOTICE)) continue;
        const line = notice.parentNode === record.target && notice.closest(LINE);
        if (!line || line.querySelector(BODY)) continue;
        // Often why it was deleted, so a link stays readable but can't be opened.
        for (const link of text.querySelectorAll('a[href]')) link.removeAttribute('href');
        notice.before(text);
        line.setAttribute('data-skek-deleted', '');
      }
    }
  }

  const watcher = new MutationObserver(keep);

  // Only watches chat while the setting is on. src/twitch/page-sync.js sets the attribute.
  function update() {
    const on = root.matches(ON);
    if (on === watching) return;
    watching = on;
    if (on) watcher.observe(root, { childList: true, subtree: true });
    else watcher.disconnect();
  }

  new MutationObserver(update).observe(root, { attributeFilter: ['data-skek-on'] });
  update();
})();
