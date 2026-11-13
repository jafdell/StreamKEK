// The Show the latest emote in the chat box setting. While Twitch's chat box is empty, the name of the
// emote chat used last shows where it says "Send a message".
// The name comes from the emote images in chat: Twitch's own, and the ones emotes.js draws. It goes in
// an element of its own beside Twitch's text, and latest-emote.css swaps the two, so Twitch still
// takes its text away when you type. Nothing is saved, and if Twitch's markup changes, the box just
// says what it always did.
(() => {
  'use strict';

  // Twitch's chat, also in the multi-stream view's frames, but not in that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const ON = "[data-skek-on~='chatLatestEmote']";
  const CHAT_BOX = "[data-a-target='chat-input']";
  const LINE = "[data-a-target='chat-line-message']";
  const EMOTE = 'img.chat-line__message--emote, img.skek-emote';
  const root = document.documentElement;

  let watching = false;
  let latest = '';
  let label = null;
  let path = null;

  // First in the box's holder, which leaves Twitch's own text right after it for the CSS to find, and
  // the box itself on top, so its cursor still shows.
  function place() {
    if (label?.isConnected) return;
    const holder = document.querySelector(CHAT_BOX)?.parentElement;
    if (!holder) return;
    label ??= Object.assign(document.createElement('div'), { className: 'skek-latest-emote', ariaHidden: 'true' });
    holder.prepend(label);
  }

  function show(name) {
    latest = name;
    place();
    if (label && label.textContent !== latest) label.textContent = latest;
  }

  // The last of these that's in a message, not in the picker or the chat box.
  function lastNamed(images, otherwise) {
    let name = otherwise;
    for (const image of images) {
      if (image.alt && image.closest(LINE)) name = image.alt;
    }
    return name;
  }

  function onChange(records) {
    let name = latest;
    // Another channel has other emotes.
    if (location.pathname !== path) {
      path = location.pathname;
      name = '';
    }
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        name = lastNamed(node.matches(EMOTE) ? [node] : node.querySelectorAll(EMOTE), name);
      }
    }
    show(name);
  }

  const watcher = new MutationObserver(onChange);

  // Only watches chat while the setting is on. src/twitch/page-sync.js sets the attribute.
  function update() {
    const on = root.matches(ON);
    if (on === watching) return;
    watching = on;
    if (on) {
      path = location.pathname;
      watcher.observe(root, { childList: true, subtree: true });
      show(lastNamed(document.querySelectorAll(EMOTE), ''));
    } else {
      watcher.disconnect();
      latest = '';
      label?.remove();
      label = null;
    }
  }

  new MutationObserver(update).observe(root, { attributeFilter: ['data-skek-on'] });
  update();
})();
