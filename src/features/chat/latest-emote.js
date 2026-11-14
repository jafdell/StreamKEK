// The Show the latest emote in the chat box setting. While Twitch's chat box is empty, the name of the
// emote chat used last shows where it says "Send a message", and Tab puts it in the box.
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

  // Tab in the empty box puts the name showing there in it. It has to be a paste, as in emotes.js: text
  // typed in by script shows in the box, but the box doesn't count it as part of the message. The space
  // after it finishes the word, so the box shows its image straight away. Captured, to come before the
  // page's own handling, which would move on to the next control.
  function onKeyDown(event) {
    if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const box = event.target.closest?.(CHAT_BOX);
    if (!box || !latest || label?.parentElement !== box.parentElement || !label.checkVisibility()) return;
    event.preventDefault();
    event.stopPropagation();
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', `${latest} `);
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
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
      document.addEventListener('keydown', onKeyDown, true);
      show(lastNamed(document.querySelectorAll(EMOTE), ''));
    } else {
      watcher.disconnect();
      document.removeEventListener('keydown', onKeyDown, true);
      latest = '';
      label?.remove();
      label = null;
    }
  }

  new MutationObserver(update).observe(root, { attributeFilter: ['data-skek-on'] });
  update();
})();
