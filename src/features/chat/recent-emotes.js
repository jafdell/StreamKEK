// The Recently used section of the emote picker, part of the same setting as emotes.js. Keeps the names
// of the last emotes you sent in Twitch's chat, Twitch's own and the ones emotes.js draws, and gives them
// to emote-picker.js. Only a short list of names is saved, not how often or when. A message counts once
// it shows in chat under your name, so one that Twitch refused doesn't. Chat is only watched for the few
// seconds after you press Enter or the send button, in the page you did that in.
// This loads after emotes.js, so by the time a message is read here, its emote names are images.
(() => {
  'use strict';

  // More than are shown, since a 7TV, BTTV or FFZ emote only shows in a chat that has it.
  const MAX_KEPT = 48;
  const MAX_NAME_LENGTH = 100;
  const SHOWN = 16;
  const TWITCH_IMAGE = /^https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\/([\w-]+)\//;
  const TWITCH_ID = /^[\w-]+$/;

  // The emotes just sent go first, the last one in the message before the others, and each name is kept
  // once. `twitch` is the emote's id when it's Twitch's own, which is what its image is built from.
  function addRecent(recent, sent) {
    const names = new Set();
    const result = [];
    for (const { name, twitch } of [...sent].reverse().concat(recent)) {
      if (names.has(name)) continue;
      names.add(name);
      result.push(twitch ? { name, twitch } : { name });
    }
    return result.slice(0, MAX_KEPT);
  }

  // `emoteFor` gives the emote to show for a name, or nothing when this chat has none, which leaves it out.
  function shownEmotes(recent, emoteFor, limit) {
    return recent.map(({ name, twitch }) => emoteFor(name, twitch)).filter(Boolean).slice(0, limit);
  }

  const twitchId = (src) => src.match(TWITCH_IMAGE)?.[1] ?? null;

  skek.recentEmotes = { addRecent, shownEmotes, twitchId };

  // Twitch's pages and its chat in the multi-stream view, but not that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const KEY = 'recentEmotes';
  const CHAT_BOX = "[data-a-target='chat-input']";
  const SEND_BUTTON = "[data-a-target='chat-send-button']";
  const LINE = "[data-a-target='chat-line-message']";
  const EMOTE = 'img.chat-line__message--emote, img.skek-emote';
  // How long a sent message gets to show in chat.
  const WAIT_MS = 5000;

  let recent = [];
  let login = null;
  let giveUp = null;

  chrome.storage.local.get({ [KEY]: [] }).then((saved) => {
    recent = saved[KEY];
  });
  // Another tab sent a message, or a backup was restored.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) recent = changes[KEY].newValue ?? [];
  });

  // Twitch's emotes work in every chat, so theirs is the image to show wherever you are. Sizes 1, 2 and 3
  // are 28, 56 and 112 pixels.
  function twitchEmote(name, id) {
    if (!TWITCH_ID.test(id)) return null;
    const sizes = [[1, 1], [2, 2], [3, 4]].map(([size, density]) => [`https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/${size}.0`, density]);
    return skek.chatEmotes.emoteEntry(name, sizes, 28, 28);
  }

  // A 7TV, BTTV or FFZ emote only shows where this chat has one by that name, with this chat's image.
  function shown() {
    return shownEmotes(recent, (name, twitch) => (twitch ? twitchEmote(name, twitch) : skek.chatEmotes.emote(name)), SHOWN);
  }

  function sentEmotes(line) {
    const sent = [];
    for (const image of line.querySelectorAll(EMOTE)) {
      if (!image.alt || image.alt.length > MAX_NAME_LENGTH) continue;
      sent.push({ name: image.alt, twitch: image.classList.contains('skek-emote') ? null : twitchId(image.src) });
    }
    return sent;
  }

  function stopWaiting() {
    clearTimeout(giveUp);
    watcher.disconnect();
  }

  // The first new message under your name is the one you just sent. Several messages arriving as one
  // piece is chat being drawn again, not a new message. Sending the same emotes again changes nothing,
  // so nothing is saved then.
  const watcher = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const lines = node.matches(LINE) ? [node] : node.querySelectorAll(LINE);
        if (lines.length !== 1 || lines[0].dataset.aUser !== login) continue;
        stopWaiting();
        const next = addRecent(recent, sentEmotes(lines[0]));
        if (JSON.stringify(next) === JSON.stringify(recent)) return;
        recent = next;
        chrome.storage.local.set({ [KEY]: recent });
        return;
      }
    }
  });

  // Twitch puts each chatter's name on their messages, and src/twitch/gql.js knows yours.
  function waitForMessage() {
    if (!skek.chatEmotes.emotesReady()) return;
    login = skek.twitchLogin();
    if (!login) return;
    clearTimeout(giveUp);
    watcher.observe(document.documentElement, { childList: true, subtree: true });
    giveUp = setTimeout(stopWaiting, WAIT_MS);
  }

  // Captured, to start watching before the page sends the message.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.target.closest?.(CHAT_BOX)) waitForMessage();
  }, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.(SEND_BUTTON)) waitForMessage();
  }, true);

  skek.recentEmotes.shown = shown;
})();
