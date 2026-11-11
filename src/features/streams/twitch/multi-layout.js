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
  // The least of the room a divider leaves on either side, so a stream can't be dragged away to nothing.
  const MIN_SPLIT = 0.2;

  const HASH_PREFIX = '#skek-multi=';
  const ENTRY = /^(twitch|youtube|kick)\/([\w-]+)(?:\/([\w-]{11}))?$/;

  const round = ({ x, y, w, h }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

  // Where a divider is: where it was dragged to, as a share of the room, or where it starts out.
  function dividerAt(split, natural, length, least = MIN_SPLIT) {
    return split == null ? natural : Math.min(1 - least, Math.max(least, split)) * length;
  }

  // Each stream is a 16:9 video with its bar on top, as big as fits its part of the room. The dividers
  // between those parts can be dragged, which `splits` remembers: `main` is between the first stream
  // and the rest, `cross` the other one. Three get one bigger than the others, on top or to the left,
  // whichever leaves it biggest before any dragging.
  // A divider's `start` and `length` are the room it moves in, so a split is (position - start) / length.
  function fitStreams(count, area, splits = {}) {
    const { w, h } = area;
    const widthIn = (tileWidth, tileHeight) => Math.max(0, Math.min(tileWidth, (tileHeight - HEAD_HEIGHT) / ASPECT));
    const cellHeight = (width) => width * ASPECT + HEAD_HEIGHT;
    const vertical = (split, at, from = 0) => ({ split, axis: 'x', x: at, y: from, w: 0, h: h - from, start: area.x, length: w });
    const horizontal = (split, at, from = 0) => ({ split, axis: 'y', x: from, y: at, w: w - from, h: 0, start: area.y, length: h });

    // Each tile is [x, y, width, height, alignX, alignY]. Its stream sits against the sides its dividers
    // are on, so the streams stay together: 0 is the start, 1 the end and 0.5 the middle.
    let tiles;
    let dividers = [];
    if (count === 2) {
      if (widthIn(w / 2, h) >= widthIn(w, h / 2)) {
        const edge = dividerAt(splits.main, w / 2, w);
        tiles = [[0, 0, edge, h, 1, 0.5], [edge, 0, w - edge, h, 0, 0.5]];
        dividers = [vertical('main', edge)];
      } else {
        const edge = dividerAt(splits.main, h / 2, h);
        tiles = [[0, 0, w, edge, 0.5, 1], [0, edge, w, h - edge, 0.5, 0]];
        dividers = [horizontal('main', edge)];
      }
    } else if (count === 3) {
      // The two small ones' bars take up room too, so the big one on the left isn't exactly twice their size.
      const barsShift = (HEAD_HEIGHT * 8) / 9;
      const onTop = Math.max(0, Math.min(w, (h - 2 * HEAD_HEIGHT) / (ASPECT * 1.5)));
      const onLeft = Math.max(0, Math.min((w + barsShift) / 1.5, (h - HEAD_HEIGHT) / ASPECT));
      // The main divider starts where the big one ends when all three are centered together.
      if (onTop >= onLeft) {
        const edge = dividerAt(splits.main, (h + cellHeight(onTop) - cellHeight(onTop / 2)) / 2, h);
        const middle = dividerAt(splits.cross, w / 2, w);
        tiles = [[0, 0, w, edge, 0.5, 1], [0, edge, middle, h - edge, 1, 0], [middle, edge, w - middle, h - edge, 0, 0]];
        dividers = [horizontal('main', edge), vertical('cross', middle, edge)];
      } else {
        const small = Math.max(0, onLeft / 2 - barsShift);
        const edge = dividerAt(splits.main, (w + onLeft - small) / 2, w);
        const middle = dividerAt(splits.cross, h / 2, h);
        tiles = [[0, 0, edge, h, 1, 0.5], [edge, 0, w - edge, middle, 0, 1], [edge, middle, w - edge, h - middle, 0, 0]];
        dividers = [vertical('main', edge), horizontal('cross', middle, edge)];
      }
    } else if (count === 4) {
      const column = dividerAt(splits.main, w / 2, w);
      const row = dividerAt(splits.cross, h / 2, h);
      tiles = [
        [0, 0, column, row, 1, 1],
        [column, 0, w - column, row, 0, 1],
        [0, row, column, h - row, 1, 0],
        [column, row, w - column, h - row, 0, 0],
      ];
      dividers = [vertical('main', column), horizontal('cross', row)];
    } else {
      tiles = [[0, 0, w, h, 0.5, 0.5]];
    }

    const inArea = (rect) => round({ ...rect, x: rect.x + area.x, y: rect.y + area.y });
    return {
      players: tiles.map(([x, y, tileWidth, tileHeight, alignX, alignY]) => {
        const width = widthIn(tileWidth, tileHeight);
        const height = cellHeight(width);
        return inArea({ x: x + (tileWidth - width) * alignX, y: y + (tileHeight - height) * alignY, w: width, h: height });
      }),
      dividers: dividers.map((divider) => ({ ...divider, ...inArea(divider) })),
    };
  }

  // Two streams each keep their chat under them. More than that share one chat with a picker: beside
  // them, or under them if the window is too narrow. `chats` is one per stream, `chat` the shared one.
  function multiLayout({ count, width, height, chat, splits = {} }) {
    const whole = { x: 0, y: 0, w: width, h: height };
    if (!chat) return { ...fitStreams(count, whole, splits), chats: null, chat: null, picker: null };

    if (count === 2 && width / 2 >= MIN_COLUMN_WIDTH) {
      const edge = dividerAt(splits.main, width / 2, width, Math.max(MIN_SPLIT, MIN_COLUMN_WIDTH / width));
      const columns = [{ x: 0, w: edge }, { x: edge, w: width - edge }].map((column) => {
        const video = Math.max(0, Math.min(column.w * ASPECT, height - HEAD_HEIGHT - MIN_CHAT_HEIGHT));
        return { ...column, top: video + HEAD_HEIGHT };
      });
      return {
        players: columns.map(({ x, w, top }) => round({ x, y: 0, w, h: top })),
        dividers: [{ split: 'main', axis: 'x', ...round({ x: edge, y: 0, w: 0, h: height }), start: 0, length: width }],
        chats: columns.map(({ x, w, top }) => round({ x, y: top, w, h: height - top })),
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
      ...fitStreams(count, streams, splits),
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
