// The multi-stream view's arithmetic: where each stream and chat goes, and how its streams are written
// in the address. No page or browser in here, so tests can run it. The view itself is multi-view.js.
(() => {
  'use strict';

  const MAX_MULTI_STREAMS = 4;
  const HEAD_HEIGHT = 28;
  const ASPECT = 9 / 16;
  const CHAT_WIDTH = 340;
  const MIN_CHAT_HEIGHT = 220;
  const PICKER_HEIGHT = 40;
  // Narrower than this and a chat beside the streams would leave them too small.
  const MIN_WIDTH_FOR_SIDE_CHAT = 900;
  // Two chats side by side stop being readable under this.
  const MIN_COLUMN_WIDTH = 280;
  const BOTTOM_CHAT_SHARE = 0.35;

  const HASH_PREFIX = '#skek-multi=';
  const ENTRY = /^(twitch|youtube|kick)\/([\w-]+)(?:\/([\w-]{11}))?$/;

  const round = ({ x, y, w, h }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

  // Each stream is a 16:9 video with its bar on top, as big as it fits. Three get one bigger than the
  // others, on top or to the left, whichever leaves it biggest.
  function fitStreams(count, area) {
    const { w, h } = area;
    const cellHeight = (width) => width * ASPECT + HEAD_HEIGHT;
    const fitting = (rowsWidth, rows) => Math.max(0, Math.min(rowsWidth, (h / rows - HEAD_HEIGHT) / ASPECT));

    let cells;
    if (count === 2) {
      const beside = fitting(w / 2, 1);
      const above = fitting(w, 2);
      cells =
        beside >= above
          ? [{ x: 0, y: 0, w: beside, h: cellHeight(beside) }, { x: beside, y: 0, w: beside, h: cellHeight(beside) }]
          : [{ x: 0, y: 0, w: above, h: cellHeight(above) }, { x: 0, y: cellHeight(above), w: above, h: cellHeight(above) }];
    } else if (count === 3) {
      // The two small ones' bars take up room too, so the big one on the left isn't exactly twice their size.
      const barsShift = (HEAD_HEIGHT * 8) / 9;
      const onTop = Math.max(0, Math.min(w, (h - 2 * HEAD_HEIGHT) / (ASPECT * 1.5)));
      const onLeft = Math.max(0, Math.min((w + barsShift) / 1.5, (h - HEAD_HEIGHT) / ASPECT));
      if (onTop >= onLeft) {
        const small = onTop / 2;
        const top = cellHeight(onTop);
        cells = [
          { x: 0, y: 0, w: onTop, h: top },
          { x: 0, y: top, w: small, h: cellHeight(small) },
          { x: small, y: top, w: small, h: cellHeight(small) },
        ];
      } else {
        const small = Math.max(0, onLeft / 2 - barsShift);
        cells = [
          { x: 0, y: 0, w: onLeft, h: cellHeight(onLeft) },
          { x: onLeft, y: 0, w: small, h: cellHeight(small) },
          { x: onLeft, y: cellHeight(small), w: small, h: cellHeight(small) },
        ];
      }
    } else if (count === 4) {
      const width = fitting(w / 2, 2);
      const height = cellHeight(width);
      cells = [0, 1, 2, 3].map((i) => ({ x: (i % 2) * width, y: Math.floor(i / 2) * height, w: width, h: height }));
    } else {
      const width = fitting(w, 1);
      cells = [{ x: 0, y: 0, w: width, h: cellHeight(width) }];
    }

    const usedWidth = Math.max(...cells.map((c) => c.x + c.w));
    const usedHeight = Math.max(...cells.map((c) => c.y + c.h));
    const left = area.x + (w - usedWidth) / 2;
    const top = area.y + (h - usedHeight) / 2;
    return cells.map((c) => round({ ...c, x: c.x + left, y: c.y + top }));
  }

  // Two streams each keep their chat under them. More than that share one chat with a picker: beside
  // them, or under them if the window is too narrow. `chats` is one per stream, `chat` the shared one.
  function multiLayout({ count, width, height, chat }) {
    const whole = { x: 0, y: 0, w: width, h: height };
    if (!chat) return { players: fitStreams(count, whole), chats: null, chat: null, picker: null };

    if (count === 2 && width / 2 >= MIN_COLUMN_WIDTH) {
      const columnWidth = width / 2;
      const video = Math.max(0, Math.min(columnWidth * ASPECT, height - HEAD_HEIGHT - MIN_CHAT_HEIGHT));
      const top = video + HEAD_HEIGHT;
      const columns = [0, 1].map((i) => i * columnWidth);
      return {
        players: columns.map((x) => round({ x, y: 0, w: columnWidth, h: top })),
        chats: columns.map((x) => round({ x, y: top, w: columnWidth, h: height - top })),
        chat: null,
        picker: null,
      };
    }

    let streams;
    let side;
    if (width >= MIN_WIDTH_FOR_SIDE_CHAT) {
      streams = { x: 0, y: 0, w: width - CHAT_WIDTH, h: height };
      side = { x: width - CHAT_WIDTH, y: 0, w: CHAT_WIDTH, h: height };
    } else {
      const chatHeight = Math.min(height / 2, Math.max(MIN_CHAT_HEIGHT, height * BOTTOM_CHAT_SHARE));
      streams = { x: 0, y: 0, w: width, h: height - chatHeight };
      side = { x: 0, y: height - chatHeight, w: width, h: chatHeight };
    }
    return {
      players: fitStreams(count, streams),
      chats: null,
      chat: round({ ...side, y: side.y + PICKER_HEIGHT, h: side.h - PICKER_HEIGHT }),
      picker: round({ ...side, h: PICKER_HEIGHT }),
    };
  }

  // The same ids the sites' channels have, so a stream here can be matched with a sidebar card.
  function multiStreamId(platform, key) {
    return platform === 'youtube' ? key : `${platform}:${key}`;
  }

  // What the address says to show, checked but not trusted: multi-view.js only opens a YouTube or Kick
  // entry that's a channel you already have, so a link can't frame anything else on those sites.
  function parseMultiHash(hash) {
    if (!hash.startsWith(HASH_PREFIX)) return [];
    const entries = new Map();
    for (const part of hash.slice(HASH_PREFIX.length).split(',')) {
      const match = part.match(ENTRY);
      if (!match) continue;
      const [, platform, rawKey, videoId = null] = match;
      const key = platform === 'twitch' ? rawKey.toLowerCase() : rawKey;
      // Twitch's channel names never have a dash, and this is what goes in its player's address.
      if (platform === 'twitch' && !/^\w+$/.test(key)) continue;
      const id = multiStreamId(platform, key);
      if (!entries.has(id) && entries.size < MAX_MULTI_STREAMS) entries.set(id, { id, platform, key, videoId });
    }
    return [...entries.values()];
  }

  function multiHash(entries) {
    const parts = entries.map(({ platform, key, videoId }) => [platform, key, videoId].filter(Boolean).join('/'));
    return `${HASH_PREFIX}${parts.join(',')}`;
  }

  function swapStreams(entries, firstId, secondId) {
    const entry = (id) => entries.find((e) => e.id === id);
    if (!entry(firstId) || !entry(secondId)) return entries;
    return entries.map((e) => {
      if (e.id === firstId) return entry(secondId);
      return e.id === secondId ? entry(firstId) : e;
    });
  }

  Object.assign(skek.streams, { MAX_MULTI_STREAMS, multiLayout, multiStreamId, parseMultiHash, multiHash, swapStreams });
})();
