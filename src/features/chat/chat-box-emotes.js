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

  // The word the cursor is at the end of, unless Twitch completes it itself: @ for names, : for its own
  // emote list and / for commands.
  function wordToComplete(text, caret) {
    if (/\S/.test(text[caret] ?? ' ')) return null;
    const word = text.slice(0, caret).match(/\S+$/)?.[0];
    return word && !/^[@:/]/.test(word) ? { word, start: caret - word.length } : null;
  }

  // Every name that starts with the word, whatever its case, with those matching its case first.
  function emoteCompletions(word, names) {
    const lower = word.toLowerCase();
    const alphabetical = [...new Set(names)]
      .filter((name) => name.toLowerCase().startsWith(lower))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return [...alphabetical.filter((name) => name.startsWith(word)), ...alphabetical.filter((name) => !name.startsWith(word))];
  }

  // The tests have no page, and only need the functions above.
  if (typeof document === 'undefined') {
    globalThis.skekChatBoxEmotes = { finishedEmotes, wordToComplete, emoteCompletions };
    return;
  }

  const BOX = "[data-a-target='chat-input']";
  const BOX_IMAGE = "[data-a-target='wysiwyg-chat-input-emote'] img";
  const AUTOCOMPLETE_ON = "[data-skek-on~='chatEmoteAutocomplete']";
  // Twitch builds the image's address from this, so it's what marks an image as one to correct.
  const FAKE_ID = 'skek-emote';

  let table = new Map();
  // Every emote put in a box so far, whose images may still be there after the table changes.
  const drawn = new Map();
  const wrapped = new WeakSet();
  let currentBox = null;
  let imageObserver = null;
  // The matches Tab is stepping through, kept while the word is still the one it last put there.
  let completing = null;

  function editorOf(box) {
    const key = Object.keys(box).find((name) => name.startsWith('__reactFiber$'));
    for (let fiber = box[key]; fiber; fiber = fiber.return) {
      const editor = fiber.memoizedProps?.editor;
      if (Array.isArray(editor?.children) && typeof editor.insertNodes === 'function') return editor;
    }
    return null;
  }

  function emoteNode(emote, id = FAKE_ID) {
    const images = { '1x': emote.src, '2x': emote.src, '4x': emote.src };
    return {
      type: 'emote',
      // Type 6 is what Twitch gives its own emotes here.
      emoteData: { type: 6, content: { alt: emote.name, emoteID: id, images: { dark: images, light: images, themed: images } } },
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

  // The Twitch emotes this person can use in this chat, by name. Twitch's list also has patterns for its
  // smileys.
  function twitchEmotes(box) {
    const key = Object.keys(box).find((name) => name.startsWith('__reactFiber$'));
    for (let fiber = box[key]; fiber; fiber = fiber.return) {
      const sets = fiber.memoizedProps?.emotes;
      if (Array.isArray(sets)) {
        const emotes = sets.flatMap((set) => set?.emotes ?? []).filter((emote) => /^\w+$/.test(emote?.token ?? ''));
        return new Map(emotes.map((emote) => [emote.token, emote.id]));
      }
    }
    return new Map();
  }

  // Twitch's own emote comes first if a name is on both, as it does when the message is sent.
  function completionNode(name, twitch) {
    const id = twitch.get(name);
    if (id) return emoteNode({ name, src: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0` }, id);
    drawn.set(name, table.get(name));
    return emoteNode(table.get(name));
  }

  // Each match goes in as its image, so stepping through them shows what each one is. Without a match
  // this leaves Tab alone, so it still moves on to the next control as it does on Twitch.
  function completeEmote(event, box) {
    const editor = editorOf(box);
    const { anchor, focus } = editor?.selection ?? {};
    if (!anchor || anchor.path.length !== 2 || anchor.path.join() !== focus.path.join() || anchor.offset !== focus.offset) return;
    const [block, piece] = anchor.path;
    const pieces = editor.children[block]?.children ?? [];
    const text = pieces[piece]?.text;
    if (typeof text !== 'string') return;

    const step = event.shiftKey ? -1 : 1;
    const before = anchor.offset === 0 ? pieces[piece - 1] : null;
    const stepping = before?.type === 'emote' && completing?.options[completing.index] === before.emoteName;
    const target = stepping ? null : wordToComplete(text, anchor.offset);
    if (!stepping && !target) return;

    const twitch = twitchEmotes(box);
    const options = stepping ? completing.options : emoteCompletions(target.word, [...table.keys(), ...twitch.keys()]);
    if (!options.length) return;
    event.preventDefault();
    event.stopPropagation();

    let index;
    if (stepping) index = (completing.index + step + options.length) % options.length;
    else index = step < 0 ? options.length - 1 : 0;
    completing = { options, index };
    const node = completionNode(options[index], twitch);

    if (stepping) {
      if (options[index] === before.emoteName) return;
      const path = [block, piece - 1];
      editor.withoutNormalizing(() => {
        editor.removeNodes({ at: path });
        editor.insertNodes(node, { at: path });
      });
      editor.select({ path: anchor.path, offset: 0 });
      return;
    }
    editor.withoutNormalizing(() => {
      editor.delete({ at: { anchor: { path: anchor.path, offset: target.start }, focus: anchor } });
      editor.insertNodes(node, { at: { path: anchor.path, offset: target.start } });
    });
    // The box always keeps a piece of text on both sides of an emote, so the emote is the next piece and
    // the cursor goes in the one after it.
    editor.select({ path: [block, piece + 2], offset: 0 });
  }

  // Before the page's own handling, which would move on to the next control.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    const box = event.target.closest?.(BOX);
    if (box && table.size && document.documentElement.matches(AUTOCOMPLETE_ON)) completeEmote(event, box);
  }, true);

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
