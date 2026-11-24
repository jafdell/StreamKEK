// The Blocked words and Highlighted words settings, in Twitch's, YouTube's and Kick's chat. The
// settings window builds its lists with addWords. Each site's chat is only ever changed by putting
// attributes on its messages, which chat-words.css acts on, so a markup change can't hide anything
// else: a selector that stops matching just leaves chat as it was.
(() => {
  'use strict';

  const DEFAULTS = { chatBlockedWords: [], chatHighlightedWords: [] };
  const MAX_LENGTH = 80;
  const HIGHLIGHT_NAME = 'skek-chat-word';

  // Commas or new lines separate words, so a list can be pasted in. A space doesn't, so that a phrase
  // can be a single entry.
  function addWords(list, text) {
    const result = [...list];
    const seen = new Set(list.map((word) => word.toLowerCase()));
    for (const part of text.split(/[,\n]/)) {
      const word = part.trim().replace(/\s+/g, ' ');
      if (!word || word.length > MAX_LENGTH || seen.has(word.toLowerCase())) continue;
      seen.add(word.toLowerCase());
      result.push(word);
    }
    return result;
  }

  // Whole words only, so blocking "ass" leaves "class" alone. Longest first, so a phrase wins over
  // a shorter word it starts with. Null when there's nothing to match.
  function wordPattern(words) {
    if (!words.length) return null;
    const escaped = [...words]
      .sort((a, b) => b.length - a.length)
      .map((word) => word.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/ /g, '\\s+'));
    return `(?<![\\p{L}\\p{M}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{M}\\p{N}_])`;
  }

  skek.chatWords = { DEFAULTS, addWords, wordPattern };

  // Twitch's chat, also in the multi-stream view's frames, and other sites' chat only inside Twitch.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;
  if (window === window.top && location.hostname !== 'www.twitch.tv') return;

  // `line` is what a blocked message hides, so it has to take the name and everything else with it,
  // and leave no empty row. `body` is only what the chatter wrote. Kick only keeps the rows on screen
  // and places them itself: it takes up the space of a row's child going away, but not the row's.
  const MESSAGES = {
    'www.twitch.tv': [
      { line: "[data-a-target='chat-line-message']", body: "[data-a-target='chat-line-message-body']" },
      { line: 'li:has(> .vod-message)', body: '.video-chat__message > span:last-child' },
    ],
    'www.youtube.com': [
      { line: 'yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer', body: '#message' },
    ],
    'kick.com': [{ line: '#chatroom-messages [data-index] > div', body: 'span.font-normal' }],
  };
  const messages = MESSAGES[location.hostname];
  if (!messages) return;

  // Coloring the words themselves this way leaves the sites' own markup as it is. Without it, a
  // highlighted message is still marked as a whole.
  const wordPaint = globalThis.Highlight ? new Highlight() : null;
  if (wordPaint) CSS.highlights.set(HIGHLIGHT_NAME, wordPaint);

  let blocked = null;
  let highlighted = null;
  let checked = new WeakMap();
  let paintedRanges = new WeakMap();
  let queued = false;

  // Emotes are images, and their names count as words.
  function messageText(body) {
    const parts = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) parts.push(node.data);
      else if (node.tagName === 'IMG') parts.push(` ${node.alt} `);
    }
    return parts.join('');
  }

  function paintWords(line, body) {
    if (!wordPaint) return;
    const ranges = [];
    const pattern = new RegExp(highlighted.source, 'giu');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      for (const match of walker.currentNode.data.matchAll(pattern)) {
        const range = new Range();
        range.setStart(walker.currentNode, match.index);
        range.setEnd(walker.currentNode, match.index + match[0].length);
        wordPaint.add(range);
        ranges.push(range);
      }
    }
    paintedRanges.set(line, ranges);
  }

  function checkLine(line, body) {
    const text = messageText(body);
    // Sites can reuse a row for another message, and YouTube fills its rows in after adding them.
    if (checked.get(line) === text) return;
    checked.set(line, text);
    for (const range of paintedRanges.get(line) ?? []) wordPaint.delete(range);
    paintedRanges.delete(line);

    const hide = !!blocked?.test(text);
    const mark = !hide && !!highlighted?.test(text);
    line.toggleAttribute('data-skek-chat-blocked', hide);
    line.toggleAttribute('data-skek-chat-highlight', mark);
    if (mark) paintWords(line, body);
  }

  function checkMessages() {
    for (const { line, body } of messages) {
      for (const lineElement of document.querySelectorAll(line)) {
        const bodyElement = lineElement.querySelector(body);
        if (bodyElement) checkLine(lineElement, bodyElement);
      }
    }
    // When a message leaves chat, the browser moves its ranges to where the message was and leaves them
    // empty. They'd stay there for good, and every one of them slows each later change to the page.
    if (wordPaint) for (const range of wordPaint) if (range.collapsed || !range.startContainer.isConnected) wordPaint.delete(range);
  }

  // On every frame rather than through skek.helpers.onPageChange, which only exists on Twitch's page
  // and is too slow here: a blocked message mustn't show before it's hidden. Only runs with words saved.
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      checkMessages();
    });
  });

  function setWords({ chatBlockedWords, chatHighlightedWords }) {
    const blockedSource = wordPattern(chatBlockedWords);
    const highlightedSource = wordPattern(chatHighlightedWords);
    blocked = blockedSource && new RegExp(blockedSource, 'iu');
    highlighted = highlightedSource && new RegExp(highlightedSource, 'iu');
    checked = new WeakMap();
    paintedRanges = new WeakMap();
    wordPaint?.clear();
    checkMessages();
    observer.disconnect();
    if (blocked || highlighted) observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const loadWords = () => chrome.storage.local.get(DEFAULTS).then(setWords);
  loadWords();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(DEFAULTS).some((key) => key in changes)) loadWords();
  });
})();
