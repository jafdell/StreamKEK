// The 7TV, BTTV and FFZ emotes setting, in Twitch's chat. Twitch draws each message as usual, then its
// emote words are swapped for images, so if Twitch's markup changes, chat just stays as text. Nothing
// is saved: the table of names and image links is only in memory and is replaced when the channel
// changes, and each image leaves with its message when Twitch removes the message from chat.
(() => {
  'use strict';

  const KEY = 'chatEmotes';
  // Which one wins when services share a name, channel emotes always before global ones. This is 7TV's
  // own order, so someone using 7TV sees the same image.
  const SERVICES = ['7TV', 'FFZ', 'BTTV'];
  const MAX_EMOTES = 10_000;
  const TIMEOUT_MS = 10_000;
  // Twitch's addresses with a first part that isn't a channel. Chat on /videos/ has no list, so it stays as it is.
  const NOT_CHANNELS = new Set(['directory', 'videos', 'settings', 'search', 'subscriptions', 'inventory', 'drops', 'wallet', 'friends', 'downloads', 'jobs', 'turbo', 'store', 'prime', 'bits', 'subs', 'p', 'u']);

  function channelFromPath(pathname) {
    const parts = pathname.toLowerCase().split('/').filter(Boolean);
    if (parts[0] === 'popout' || parts[0] === 'embed') parts.shift();
    if (parts[0] === 'moderator') parts.shift();
    const login = parts[0];
    return login && /^\w+$/.test(login) && !NOT_CHANNELS.has(login) ? login : null;
  }

  // These lists come from outside StreamKEK, so an image from anywhere else is dropped.
  function imageUrl(url, host) {
    try {
      const parsed = new URL(url, 'https://invalid.invalid/');
      return parsed.protocol === 'https:' && parsed.hostname === host ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function emoteEntry(name, sizes, width, height) {
    return {
      name,
      src: sizes[0][0],
      srcset: sizes.map(([url, density]) => `${url} ${density}x`).join(', '),
      width,
      height,
    };
  }

  function sevenTvEmotes(emotes) {
    const result = [];
    for (const emote of emotes ?? []) {
      // A channel can rename an emote, so emote.name is what its chat types, not emote.data.name. BTTV
      // and FFZ's 7TV add-on also hide unlisted emotes by default.
      if (!emote?.name || !emote.data?.listed) continue;
      const base = imageUrl(emote.data.host?.url, 'cdn.7tv.app');
      if (!base) continue;
      const { width, height } = emote.data.host.files?.[0] ?? {};
      const sizes = [1, 2, 4].map((density) => [`${base}/${density}x.webp`, density]);
      result.push(emoteEntry(emote.name, sizes, width, height));
    }
    return result;
  }

  // BTTV gives no sizes, so these images take up their width only once they've loaded.
  function bttvEmotes(emotes) {
    const result = [];
    for (const emote of emotes ?? []) {
      // Modifiers change the emote next to them, and aren't images to show.
      if (!emote?.code || emote.modifier || !/^\w+$/.test(emote.id ?? '')) continue;
      const sizes = [1, 2, 3].map((density) => [`https://cdn.betterttv.net/emote/${emote.id}/${density}x.webp`, density]);
      result.push(emoteEntry(emote.code, sizes));
    }
    return result;
  }

  function ffzEmotes(sets) {
    const result = [];
    for (const set of sets) {
      for (const emote of set?.emoticons ?? []) {
        if (!emote?.name || emote.modifier) continue;
        // An animated emote lists its moving images apart from its still ones, and not every size exists.
        const urls = emote.animated ?? emote.urls ?? {};
        const sizes = [1, 2, 4]
          .map((density) => [imageUrl(urls[density], 'cdn.frankerfacez.com'), density])
          .filter(([url]) => url);
        if (sizes.length) result.push(emoteEntry(emote.name, sizes, emote.width, emote.height));
      }
    }
    return result;
  }

  // FFZ's response also has sets that only its subscribers get.
  function ffzGlobalSets(response) {
    return (response?.default_sets ?? []).map((id) => response.sets?.[id]);
  }

  // A Map, so that a word in chat like "constructor" can't match by accident. The first one to claim a
  // name keeps it.
  function mergeEmotes(channelLists, globalLists) {
    const emotes = new Map();
    for (const lists of [channelLists, globalLists]) {
      for (const service of SERVICES) {
        for (const emote of lists[service] ?? []) {
          if (emotes.size >= MAX_EMOTES) return emotes;
          if (!emotes.has(emote.name)) emotes.set(emote.name, emote);
        }
      }
    }
    return emotes;
  }

  // A message's text as plain text and emotes in order, or null if it has no emotes.
  function messageParts(text, emotes) {
    const words = text.split(' ');
    if (!words.some((word) => emotes.has(word))) return null;
    const parts = [];
    let plain = '';
    words.forEach((word, index) => {
      const emote = emotes.get(word);
      if (emote) {
        if (plain) parts.push(plain);
        plain = '';
        parts.push(emote);
      } else {
        plain += word;
      }
      if (index < words.length - 1) plain += ' ';
    });
    if (plain) parts.push(plain);
    return parts;
  }

  skek.chatEmotes = { channelFromPath, sevenTvEmotes, bttvEmotes, ffzEmotes, ffzGlobalSets, mergeEmotes, messageParts };

  // Twitch's pages and its chat in the multi-stream view, but not that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const MESSAGE_TEXT = "span[data-a-target='chat-message-text']";
  const ID_QUERY = 'query($login:String!){user(login:$login){id}}';
  // How far the tooltip sits from its emote, and from the window's edge.
  const TIP_GAP = 10;
  const TIP_EDGE = 4;

  let tip = null;
  let tipEmote = null;
  let table = null;
  let lastPath = null;
  let channel = null;
  let loading = null;
  let globalLists = null;

  // Someone with one of these already sees emotes the way they set it up. BTTV leaves no mark on the
  // page until it draws its first emote.
  function otherExtensionRunning() {
    return !!document.body?.dataset.ffzSource
      || !!document.getElementById('ffz-script')
      || !!document.getElementById('seventv-extension')
      || document.getElementsByTagName('seventv-container').length > 0
      || document.getElementsByClassName('bttv-emote').length > 0;
  }

  // A channel that doesn't use a service gets a 404 from it.
  async function fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    return response.ok ? response.json() : null;
  }

  // Each service on its own, so one being down doesn't stop the others.
  async function loadLists(loaders) {
    const results = await Promise.allSettled(SERVICES.map((service) => loaders[service]()));
    return Object.fromEntries(SERVICES.map((service, index) => [service, results[index].value ?? []]));
  }

  const globalLoaders = (signal) => ({
    '7TV': async () => sevenTvEmotes((await fetchJson('https://7tv.io/v3/emote-sets/global', signal))?.emotes),
    FFZ: async () => ffzEmotes(ffzGlobalSets(await fetchJson('https://api.frankerfacez.com/v1/set/global', signal))),
    BTTV: async () => bttvEmotes(await fetchJson('https://api.betterttv.net/3/cached/emotes/global', signal)),
  });

  const channelLoaders = (id, signal) => ({
    // The lookup normally has the whole emote set in it, which saves a second download.
    '7TV': async () => {
      const user = await fetchJson(`https://7tv.io/v3/users/twitch/${id}`, signal);
      const emotes = user?.emote_set?.emotes;
      if (emotes?.every((emote) => emote.data)) return sevenTvEmotes(emotes);
      if (!user?.emote_set_id) return [];
      const set = await fetchJson(`https://7tv.io/v3/emote-sets/${encodeURIComponent(user.emote_set_id)}`, signal);
      return sevenTvEmotes(set?.emotes);
    },
    FFZ: async () => {
      const room = await fetchJson(`https://api.frankerfacez.com/v1/room/id/${id}`, signal);
      return ffzEmotes(Object.values(room?.sets ?? {}));
    },
    BTTV: async () => {
      const user = await fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${id}`, signal);
      return bttvEmotes([...(user?.channelEmotes ?? []), ...(user?.sharedEmotes ?? [])]);
    },
  });

  function emoteImage(emote) {
    const image = document.createElement('img');
    image.className = 'skek-emote';
    image.alt = emote.name;
    image.decoding = 'async';
    // Holds the emote's space while it loads, so its row jumps less. emotes.css sets the real height.
    if (emote.width && emote.height) {
      image.width = emote.width;
      image.height = emote.height;
    }
    image.srcset = emote.srcset;
    image.src = emote.src;
    return image;
  }

  // Hovering shows the name to type, looking like the tooltip on Twitch's own emotes. There's only one
  // tooltip, and it's on the page only while it's showing.
  function showTip(image) {
    tip ??= Object.assign(document.createElement('div'), { className: 'skek-emote-tip' });
    tip.textContent = image.alt;
    // In fullscreen, only what's inside the fullscreen element can show.
    (document.fullscreenElement ?? document.body).append(tip);
    const emote = image.getBoundingClientRect();
    const { width, height } = tip.getBoundingClientRect();
    const center = emote.left + emote.width / 2;
    const left = Math.max(TIP_EDGE, Math.min(center - width / 2, window.innerWidth - width - TIP_EDGE));
    const below = emote.top - TIP_GAP - height < TIP_EDGE;
    tip.classList.toggle('skek-emote-tip--below', below);
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? emote.bottom + TIP_GAP : emote.top - TIP_GAP - height}px`;
    tip.style.setProperty('--skek-tip-arrow', `${center - left}px`);
    tipEmote = image;
  }

  function hideTip() {
    tip?.remove();
    tipEmote = null;
  }

  function onMouseOver(event) {
    if (event.target.classList?.contains('skek-emote')) showTip(event.target);
  }

  function onMouseOut(event) {
    if (event.target === tipEmote) hideTip();
  }

  function swapEmotes(textElement) {
    for (const node of [...textElement.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const parts = messageParts(node.data, table);
      if (parts) node.replaceWith(...parts.map((part) => (typeof part === 'string' ? part : emoteImage(part))));
    }
  }

  async function loadChannel(login) {
    loading?.abort();
    table = null;
    if (!login) return;
    const controller = new AbortController();
    loading = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]);
    // Global lists aren't tied to this channel, so changing channel doesn't cancel them.
    globalLists ??= loadLists(globalLoaders(AbortSignal.timeout(TIMEOUT_MS)));

    const data = await skek.twitchGql(ID_QUERY, { login }, signal).catch(() => null);
    const id = data?.user?.id;
    const [channelLists, global] = await Promise.all([
      /^\d+$/.test(id ?? '') ? loadLists(channelLoaders(id, signal)) : {},
      globalLists,
    ]);
    if (controller.signal.aborted) return;
    table = mergeEmotes(channelLists, global);
    document.querySelectorAll(MESSAGE_TEXT).forEach(swapEmotes);
  }

  function syncChannel() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    // The stream view's address, like /kick/<channel>, isn't a Twitch channel.
    const login = document.getElementById('skek-view') ? null : channelFromPath(lastPath);
    if (login === channel) return;
    channel = login;
    loadChannel(login);
  }

  // Nothing is downloaded until there's a message to show, so a page without chat costs nothing.
  function handleMessages(textElements) {
    if (!textElements.length) return;
    if (otherExtensionRunning()) {
      stop();
      return;
    }
    syncChannel();
    if (table) textElements.forEach(swapEmotes);
  }

  // Runs before the browser paints, so a message doesn't show its emote names first. It only looks at
  // what was just added, unlike chat-words.js, so it doesn't need to wait for a frame.
  const observer = new MutationObserver((records) => {
    // A removed image never gets a mouseout.
    if (tipEmote && !tipEmote.isConnected) hideTip();
    const textElements = [];
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches(MESSAGE_TEXT)) textElements.push(node);
        else textElements.push(...node.querySelectorAll(MESSAGE_TEXT));
      }
    }
    handleMessages(textElements);
  });

  function start() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    // Scrolling moves the emote out from under the tooltip. Scroll events don't bubble, so this needs capture.
    document.addEventListener('scroll', hideTip, { capture: true, passive: true });
    handleMessages([...document.querySelectorAll(MESSAGE_TEXT)]);
  }

  function stop() {
    observer.disconnect();
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    document.removeEventListener('scroll', hideTip, { capture: true });
    hideTip();
    loading?.abort();
    loading = null;
    table = null;
    globalLists = null;
    lastPath = null;
    channel = null;
    for (const image of document.querySelectorAll('img.skek-emote')) image.replaceWith(image.alt);
  }

  function applySetting() {
    chrome.storage.local.get({ [KEY]: skek.settingDefaults[KEY] }).then((values) => {
      if (values[KEY]) start();
      else stop();
    });
  }

  applySetting();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEY in changes) applySetting();
  });
})();
