// Turns a typed 7TV, BTTV or FFZ emote into its image in Twitch's chat box, as Twitch does with its own.
// A name can be the start of a longer one, like KEK and KEKW, so a word only turns once the cursor has
// left it. This runs in Twitch's own page to reach the box's editor through React, which has an emote
// item of its own, so what gets sent stays the emote's name. If that changes, words just stay as text.
// emotes.js sends the table of emotes, since this world has no skek or chrome.*.
(() => {
  'use strict';

  // The words in a piece of the box's text that are emotes, leaving out any the cursor is touching.
  // `caret` is null when the cursor is somewhere else. Last first, so replacing them in this order
  // doesn't move the ones still to do.
  function finishedEmotes(text, caret, table) {
    const words = [];
    for (const match of text.matchAll(/\S+/g)) {
      const start = match.index;
      const end = start + match[0].length;
      if (table.has(match[0]) && !(caret !== null && caret >= start && caret <= end)) {
        words.push({ name: match[0], start, end });
      }
    }
    return words.reverse();
  }

  // The tests have no page, and only need the function above.
  if (typeof document === 'undefined') {
    globalThis.skekChatBoxEmotes = { finishedEmotes };
    return;
  }

  const BOX = "[data-a-target='chat-input']";
  const BOX_IMAGE = "[data-a-target='wysiwyg-chat-input-emote'] img";
  // Twitch builds the image's address from this, so it's what marks an image as one to correct.
  const FAKE_ID = 'skek-emote';

  let table = new Map();
  // Every emote put in a box so far, whose images may still be there after the table changes.
  const drawn = new Map();
  const wrapped = new WeakSet();
  let currentBox = null;
  let imageObserver = null;

  function editorOf(box) {
    const key = Object.keys(box).find((name) => name.startsWith('__reactFiber$'));
    for (let fiber = box[key]; fiber; fiber = fiber.return) {
      const editor = fiber.memoizedProps?.editor;
      if (Array.isArray(editor?.children) && typeof editor.insertNodes === 'function') return editor;
    }
    return null;
  }

  function emoteNode(emote) {
    const images = { '1x': emote.src, '2x': emote.src, '4x': emote.src };
    return {
      type: 'emote',
      // Type 6 is what Twitch gives its own emotes here.
      emoteData: { type: 6, content: { alt: emote.name, emoteID: FAKE_ID, images: { dark: images, light: images, themed: images } } },
      emoteName: emote.name,
      children: [{ type: 'text', text: '' }],
    };
  }

  function turnFinishedWords(editor) {
    const { selection } = editor;
    // Dragging across the text shouldn't change it under the mouse.
    if (selection && (selection.anchor.path.join() !== selection.focus.path.join() || selection.anchor.offset !== selection.focus.offset)) return;
    for (let block = editor.children.length - 1; block >= 0; block -= 1) {
      const pieces = editor.children[block].children ?? [];
      for (let piece = pieces.length - 1; piece >= 0; piece -= 1) {
        const text = pieces[piece].text;
        if (!text) continue;
        const here = selection?.anchor.path[0] === block && selection.anchor.path[1] === piece;
        for (const { name, start, end } of finishedEmotes(text, here ? selection.anchor.offset : null, table)) {
          const path = [block, piece];
          drawn.set(name, table.get(name));
          editor.withoutNormalizing(() => {
            editor.delete({ at: { anchor: { path, offset: start }, focus: { path, offset: end } } });
            editor.insertNodes(emoteNode(table.get(name)), { at: { path, offset: start } });
          });
        }
      }
    }
  }

  // When the setting goes off or StreamKEK steps aside, the box goes back to plain words.
  function turnBackToWords(editor) {
    for (let block = editor.children.length - 1; block >= 0; block -= 1) {
      const pieces = editor.children[block].children ?? [];
      for (let piece = pieces.length - 1; piece >= 0; piece -= 1) {
        const node = pieces[piece];
        if (node.emoteData?.content?.emoteID !== FAKE_ID) continue;
        const path = [block, piece];
        editor.withoutNormalizing(() => {
          editor.removeNodes({ at: path });
          editor.insertNodes({ type: 'text', text: node.emoteName }, { at: path });
        });
      }
    }
  }

  function correctImages(box) {
    for (const image of box.querySelectorAll(BOX_IMAGE)) {
      const emote = drawn.get(image.alt);
      if (!emote || !image.src.includes(FAKE_ID)) continue;
      image.srcset = emote.srcset;
      image.src = emote.src;
    }
  }

  function watchBox(box) {
    if (box !== currentBox) {
      imageObserver?.disconnect();
      currentBox = box;
      imageObserver = new MutationObserver(() => correctImages(box));
      imageObserver.observe(box, { childList: true, subtree: true });
    }
    const editor = editorOf(box);
    if (!editor || wrapped.has(editor)) return editor;
    wrapped.add(editor);
    const onChange = editor.onChange;
    editor.onChange = (...args) => {
      onChange(...args);
      if (table.size) turnFinishedWords(editor);
    };
    return editor;
  }

  document.addEventListener('focusin', (event) => {
    const box = event.target.closest?.(BOX);
    if (box) watchBox(box);
  });

  document.addEventListener('skek-emote-table', (event) => {
    table = new Map(JSON.parse(event.detail));
    const box = document.querySelector(BOX);
    const editor = box && watchBox(box);
    if (!editor) return;
    if (table.size) turnFinishedWords(editor);
    else turnBackToWords(editor);
  });
})();
