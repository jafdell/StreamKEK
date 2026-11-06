// The multi-stream view: two to four streams at once, from any site, opened by dragging a channel from
// the sidebar onto the page. Its streams are in the address, like the stream view's, so reloading and
// Back work: routes.js reads it and calls syncMulti. Its sizes are worked out in multi-layout.js.
// Every frame stays where it was put in this element and only its position changes, because moving a
// frame in the page would reload it.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, icon, onBodyReady } = skek.helpers;
  const { state, platformOf, siteOf, streamsOf, compact, frame, chatSettings, placeRoot, pauseTwitchVideos, resumeTwitchVideos, multiLayout, swapStreams, MAX_MULTI_STREAMS, CHANNEL_PATH } = shared;

  const VIEW_ID = 'skek-view';
  const PLAYER_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  const CHAT_ALLOW = 'clipboard-write';
  const MUTED_MARK = '#skek-muted';
  const TICK_MS = 500;
  const TITLE = 'Multi-stream - Twitch';
  const DROP_CLASS = 'skek-drop';
  const MOVING_CLASS = 'skek-multi--moving';
  // Further than a click wanders, so a click on a stream's name still opens its channel.
  const MOVE_THRESHOLD_PX = 5;
  const HINT_ADD = 'Drag a channel from the sidebar to add it.';
  const HINT_MOVE = "Drag a stream's name onto another to swap them.";

  // Channels seen in a drag, for their name until their site has said more. Lasts for this page.
  const knownChannels = new Map();

  let savedTitle = '';
  let tickTimer = null;
  let observer = null;
  let dropOverlay = null;
  // The stream whose bar is being dragged, with what shows while it is.
  let moving = null;

  function setButton(button, label, iconName) {
    button.title = label;
    button.ariaLabel = label;
    button.replaceChildren(icon(iconName));
  }

  function barButton(className, onClick) {
    return el('button', { class: `skek-iconbtn skek-multi__button ${className}`, type: 'button', on: { click: onClick } });
  }

  // A YouTube or Kick entry has to be a channel you already have. See parseMultiHash.
  function channelFor({ id, platform, key }) {
    const known = knownChannels.get(id) ?? state.favorites.find((c) => c.id === id);
    if (platform === 'twitch') return known ?? { id, platform, login: key, name: key, avatar: '' };
    return state.channels.find((c) => c.id === id) ?? known ?? null;
  }

  function entryFor(channel, videoId = null) {
    const platform = platformOf(channel);
    const key = channel.login ?? channel.slug ?? channel.id;
    const carriesVideo = siteOf(channel).routeTail;
    return { id: channel.id, platform, key, videoId: carriesVideo ? videoId : null };
  }

  function streamFor(entry) {
    if (entry.platform === 'twitch') return { videoId: entry.key };
    const streams = streamsOf(state.live[entry.id]);
    return streams.find((s) => s.videoId === entry.videoId) ?? streams[0] ?? null;
  }

  // A frame that hasn't loaded yet has this sent when it does.
  function sendAudio(entry) {
    const { playerFrame, playerReady } = entry;
    if (!playerReady || !playerFrame?.contentWindow) return;
    playerFrame.contentWindow.postMessage({ skekMuted: state.multi?.audioId !== entry.id }, new URL(playerFrame.src).origin);
  }

  function setAudio(id) {
    const { multi } = state;
    multi.audioId = id;
    for (const entry of multi.entries) {
      sendAudio(entry);
      updateEntryButtons(entry);
    }
  }

  function setChat(id) {
    state.multi.chatId = id;
    applyLayout();
  }

  // A frame only loads once its chat is showing, since up to three more could be waiting behind it.
  function showChat(entry, rect) {
    place(entry.chatBox, rect);
    if (entry.chatLoaded || !entry.urls) return;
    entry.chatLoaded = true;
    entry.chatBox.replaceChildren(frame('skek-multi__frame', entry.urls.chat, CHAT_ALLOW));
  }

  function place(node, rect) {
    if (!rect) {
      node.style.display = 'none';
      return;
    }
    const { style } = node;
    style.display = '';
    style.left = `${rect.x}px`;
    style.top = `${rect.y}px`;
    style.width = `${rect.w}px`;
    style.height = `${rect.h}px`;
  }

  function applyLayout() {
    const { multi } = state;
    if (!multi?.entries.length) return;
    const { stage, picker } = multi.refs;
    const layout = multiLayout({
      count: multi.entries.length,
      width: stage.clientWidth,
      height: stage.clientHeight,
      chat: !multi.chatHidden,
    });
    multi.sharedChat = !!layout.chat;

    multi.entries.forEach((entry, i) => {
      place(entry.cell, layout.players[i]);
      if (layout.chats) showChat(entry, layout.chats[i]);
      else if (layout.chat && entry.id === multi.chatId) showChat(entry, layout.chat);
      else place(entry.chatBox, null);
      updateEntryButtons(entry);
    });
    place(picker, layout.picker);
    if (layout.picker) renderPicker();
  }

  function renderPicker() {
    const { multi } = state;
    multi.refs.picker.replaceChildren(
      ...multi.entries.map((entry) =>
        el(
          'button',
          {
            class: `skek-multi__tab${entry.id === multi.chatId ? ' skek-multi__tab--active' : ''}`,
            type: 'button',
            title: `${entry.channel.name}'s chat`,
            on: { click: () => setChat(entry.id) },
          },
          siteIcon(entry.channel),
          el('span', { class: 'skek-multi__tab-name' }, entry.channel.name),
        ),
      ),
    );
  }

  function siteIcon(channel) {
    const platform = platformOf(channel);
    return el('span', { class: `skek-multi__site skek-multi__site--${platform}`, title: siteOf(channel).name }, icon(platform));
  }

  function moveToFront(id) {
    const { entries } = state.multi;
    shared.showMulti([...entries.filter((e) => e.id === id), ...entries.filter((e) => e.id !== id)]);
  }

  function removeStream(id) {
    const rest = state.multi.entries.filter((e) => e.id !== id);
    if (rest.length < 2) shared.leaveMulti(rest[0]?.channel ?? null, rest[0]?.videoId);
    else shared.showMulti(rest);
  }

  // Dragging a stream's bar onto another stream swaps them, which only changes where they're placed.
  // With the pointer rather than the browser's drag, because this view's own overlay is all it needs
  // and nothing here has to leave the page. The overlay is there so the frames can't take the mouse.
  function beginMove(entry, pointerId, stop) {
    const { multi } = state;
    const overlay = el('div', { class: 'skek-multi__swap' });
    for (const other of multi.entries) {
      const self = other === entry;
      const tile = el(
        'div',
        { class: `skek-multi__swap-tile${self ? ' skek-multi__swap-tile--self' : ''}`, 'data-skek-swap': other.id },
        self ? null : el('span', {}, `Swap with ${other.channel.name}`),
      );
      const { cell } = other;
      place(tile, { x: cell.offsetLeft, y: cell.offsetTop, w: cell.offsetWidth, h: cell.offsetHeight });
      overlay.append(tile);
    }
    const ghost = el('div', { class: 'skek-multi__ghost' }, siteIcon(entry.channel), el('span', {}, entry.channel.name));
    multi.refs.stage.append(overlay);
    multi.root.append(ghost);
    multi.root.classList.add(MOVING_CLASS);
    // So a release outside the window still counts.
    try {
      entry.refs.head.setPointerCapture(pointerId);
    } catch {
      // The pointer's already gone, and its release will end this.
    }
    moving = { entry, overlay, ghost, stop, targetId: null };
  }

  function updateMove({ clientX, clientY }) {
    const { overlay, ghost, entry } = moving;
    ghost.style.transform = `translate(${clientX}px, ${clientY}px)`;
    const tile = document.elementFromPoint(clientX, clientY)?.closest('[data-skek-swap]');
    const targetId = tile && tile.dataset.skekSwap !== entry.id ? tile.dataset.skekSwap : null;
    moving.targetId = targetId;
    for (const node of overlay.children) node.classList.toggle('skek-multi__swap-tile--over', node === tile && !!targetId);
  }

  function endMove(swap) {
    const { entry, overlay, ghost, stop, targetId } = moving;
    moving = null;
    stop();
    overlay.remove();
    ghost.remove();
    const { multi } = state;
    multi.root.classList.remove(MOVING_CLASS);
    if (swap && targetId) shared.showMulti(swapStreams(multi.entries, entry.id, targetId));
  }

  // A drag that started on the name shouldn't also count as clicking it.
  function ignoreNextClick() {
    const ignore = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    addEventListener('click', ignore, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', ignore, true));
  }

  function watchForMove(event, entry) {
    if (event.button !== 0 || event.target.closest('button')) return;
    const { pointerId, clientX: startX, clientY: startY } = event;
    const onMove = (e) => {
      if (e.pointerId !== pointerId) return;
      if (!moving) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < MOVE_THRESHOLD_PX) return;
        beginMove(entry, pointerId, stop);
      }
      updateMove(e);
    };
    const onUp = (e) => {
      if (e.pointerId !== pointerId) return;
      if (!moving) {
        stop();
        return;
      }
      updateMove(e);
      endMove(true);
      ignoreNextClick();
    };
    const onCancel = (e) => {
      if (e.pointerId !== pointerId) return;
      if (moving) endMove(false);
      else stop();
    };
    function stop() {
      removeEventListener('pointermove', onMove, true);
      removeEventListener('pointerup', onUp, true);
      removeEventListener('pointercancel', onCancel, true);
    }
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onCancel, true);
  }

  function buildEntry(wanted, channel) {
    const refs = {};
    const ref = (name, node) => ((refs[name] = node), node);
    const entry = { ...wanted, channel, refs, frameKey: undefined, urls: null, chatLoaded: false, playerFrame: null, playerReady: false };
    entry.cell = el(
      'div',
      { class: 'skek-multi__cell' },
      ref(
        'head',
        el(
          'div',
          { class: 'skek-multi__head', on: { pointerdown: (event) => watchForMove(event, entry) } },
          siteIcon(channel),
          ref('name', el('a', { class: 'skek-multi__name', target: '_blank', rel: 'noopener', draggable: false })),
          ref('viewers', el('span', { class: 'skek-multi__viewers' })),
          el('span', { class: 'skek-multi__spacer' }),
          ref('enlarge', barButton('skek-multi__enlarge', () => moveToFront(entry.id))),
          ref('chatButton', barButton('skek-multi__chat-button', () => setChat(entry.id))),
          ref('audio', barButton('skek-multi__audio', () => setAudio(state.multi.audioId === entry.id ? null : entry.id))),
          ref('remove', barButton('skek-multi__remove', () => removeStream(entry.id))),
        ),
      ),
      ref('player', el('div', { class: 'skek-multi__player' })),
    );
    entry.chatBox = el('div', { class: 'skek-multi__chat' });
    setButton(refs.enlarge, 'Make this stream bigger', 'theatre');
    setButton(refs.chatButton, "Show this stream's chat", 'chat');
    setButton(refs.remove, 'Close this stream', 'close');
    return entry;
  }

  function updateEntryButtons(entry) {
    const { multi } = state;
    const { refs } = entry;
    const hasSound = multi.audioId === entry.id;
    setButton(refs.audio, hasSound ? 'Mute this stream' : 'Listen to this stream', hasSound ? 'speaker' : 'speakerOff');
    refs.audio.classList.toggle('skek-multi__button--on', hasSound);
    refs.chatButton.hidden = !multi.sharedChat;
    refs.chatButton.classList.toggle('skek-multi__button--on', entry.id === multi.chatId);
    // Only three streams have one bigger than the others.
    refs.enlarge.hidden = multi.entries.length !== 3 || multi.entries[0] === entry;
  }

  function loadFrames(entry, stream) {
    const { channel, refs } = entry;
    const frameKey = stream ? `${entry.id}/${stream.videoId}` : null;
    if (entry.frameKey === frameKey) return;
    entry.frameKey = frameKey;
    entry.chatLoaded = false;
    entry.playerFrame = null;
    entry.playerReady = false;
    entry.urls = null;

    if (!stream) {
      refs.player.replaceChildren(el('div', { class: 'skek-offline' }, el('p', {}, `${channel.name} is offline.`)));
      entry.chatBox.replaceChildren(el('p', { class: 'skek-chat__empty' }, 'Chat is available while the channel is live.'));
      return;
    }

    entry.urls = siteOf(channel).frameUrls(channel, stream, chatSettings());
    const muted = state.multi.audioId !== entry.id;
    entry.playerFrame = frame('skek-multi__frame', `${entry.urls.player}${muted ? MUTED_MARK : ''}`, PLAYER_ALLOW);
    const playerFrame = entry.playerFrame;
    playerFrame.addEventListener('load', () => {
      if (entry.playerFrame !== playerFrame) return;
      entry.playerReady = true;
      sendAudio(entry);
    });
    refs.player.replaceChildren(playerFrame);
    entry.chatBox.replaceChildren();
  }

  // What the entry's channel has to say now: its name, whether it's live and how many are watching.
  function updateEntry(entry) {
    const isTwitch = entry.platform === 'twitch';
    const status = isTwitch ? shared.twitchStatusOf(entry.id) : null;
    const current = channelFor(entry) ?? entry.channel;
    entry.channel = status?.name ? { ...current, name: status.name } : current;

    const stream = streamFor(entry);
    if (stream && !isTwitch && siteOf(entry.channel).routeTail && stream.videoId !== entry.videoId) entry.videoId = stream.videoId;
    loadFrames(entry, stream);

    const { refs, channel } = entry;
    const live = isTwitch ? status?.live : stream;
    refs.name.textContent = channel.name;
    refs.name.href = siteOf(channel).channelUrl(channel);
    refs.viewers.textContent = live?.viewers == null ? '' : compact(live.viewers);
    refs.viewers.hidden = live?.viewers == null;
  }

  function buildRoot() {
    const refs = {};
    const ref = (name, node) => ((refs[name] = node), node);
    const root = el(
      'div',
      { id: VIEW_ID, class: 'skek-view skek-multi' },
      el(
        'div',
        { class: 'skek-multi__bar' },
        el('h2', { class: 'skek-multi__title' }, 'Multi-stream'),
        ref('hint', el('span', { class: 'skek-multi__hint' })),
        el('span', { class: 'skek-multi__spacer' }),
        ref('chatToggle', barButton('', () => setChatHidden(!state.multi.chatHidden))),
        ref('fullToggle', barButton('', () => setFull(!state.multi.full))),
        ref('close', barButton('', () => shared.leaveMulti(null))),
      ),
      ref('stage', el('div', { class: 'skek-multi__stage' }, ref('picker', el('div', { class: 'skek-multi__picker' })))),
    );
    setButton(refs.close, 'Close multi-stream', 'close');
    return { root, refs };
  }

  function setChatHidden(hidden) {
    const { multi } = state;
    multi.chatHidden = hidden;
    setButton(multi.refs.chatToggle, hidden ? 'Show chat' : 'Hide chat', 'chat');
    multi.refs.chatToggle.classList.toggle('skek-multi__button--on', !hidden);
    applyLayout();
  }

  function setFull(full) {
    const { multi } = state;
    multi.full = full;
    multi.root.classList.toggle('skek-view--full-window', full);
    setButton(multi.refs.fullToggle, full ? 'Exit theatre mode (Alt+T)' : 'Theatre mode (Alt+T)', 'theatre');
    multi.refs.fullToggle.classList.toggle('skek-multi__button--on', full);
    placeMulti();
  }

  function placeMulti() {
    if (state.multi) placeRoot(state.multi.root, state.multi.full);
  }

  function openMulti() {
    const { root, refs } = buildRoot();
    state.multi = { root, refs, entries: [], hash: '', audioId: null, chatId: null, chatHidden: false, full: false, sharedChat: false, started: false };
    savedTitle = document.title;
    setChatHidden(false);
    setFull(false);
    observer = new ResizeObserver(applyLayout);
    observer.observe(refs.stage);
    tickTimer = setInterval(() => {
      placeMulti();
      pauseTwitchVideos();
      if (document.title !== TITLE) document.title = TITLE;
    }, TICK_MS);
    document.title = TITLE;
    pauseTwitchVideos();
  }

  function closeMulti() {
    if (!state.multi) return;
    if (moving) endMove(false);
    clearInterval(tickTimer);
    observer?.disconnect();
    state.multi.root.remove();
    state.multi = null;
    if (savedTitle) document.title = savedTitle;
    resumeTwitchVideos();
    shared.renderSidebar();
  }

  // What the address now says to show. Streams already showing keep their frames.
  function syncMulti(wanted, hash) {
    if (state.multi?.hash === hash) return;
    const resolved = wanted.map((entry) => ({ wanted: entry, channel: state.multi?.entries.find((e) => e.id === entry.id)?.channel ?? channelFor(entry) }));
    const usable = resolved.filter(({ channel }) => channel);
    // Fewer than two is a link or a reload whose channels aren't there any more. This address goes,
    // so Back doesn't lead straight here again.
    if (usable.length < 2) {
      closeMulti();
      shared.forgetMultiUrl();
      if (usable[0]) shared.leaveMulti(usable[0].channel, usable[0].wanted.videoId);
      return;
    }

    if (!state.multi) openMulti();
    const { multi } = state;
    multi.hash = hash;
    const previous = multi.entries;
    multi.entries = usable.map(({ wanted: entry, channel }) => {
      const existing = previous.find((e) => e.id === entry.id);
      if (existing) {
        if (entry.videoId) existing.videoId = entry.videoId;
        return existing;
      }
      const built = buildEntry(entry, channel);
      multi.refs.stage.append(built.cell, built.chatBox);
      return built;
    });
    for (const entry of previous) {
      if (!multi.entries.includes(entry)) {
        entry.cell.remove();
        entry.chatBox.remove();
      }
    }

    // The first stream starts with the sound, and sound goes back to it if the one that had it closes.
    // Muting everything on purpose stays that way.
    const hasAudio = multi.entries.some((e) => e.id === multi.audioId);
    if (!multi.started || (!hasAudio && multi.audioId !== null)) multi.audioId = multi.entries[0].id;
    multi.started = true;
    if (!multi.entries.some((e) => e.id === multi.chatId)) multi.chatId = multi.entries[0].id;

    multi.refs.hint.textContent = multi.entries.length < MAX_MULTI_STREAMS ? `${HINT_ADD} ${HINT_MOVE}` : HINT_MOVE;
    updateMulti();
    for (const entry of multi.entries) sendAudio(entry);
    placeMulti();
    applyLayout();
    shared.refreshTwitchStatus();
    shared.renderSidebar();
  }

  // After something saved changed, like what's live.
  function updateMulti() {
    const { multi } = state;
    if (!multi) return;
    for (const entry of multi.entries) updateEntry(entry);
    applyLayout();
    // A YouTube channel can move on to its next stream, and a reload should find that one.
    shared.rememberMulti(multi.entries);
  }

  function currentTwitchChannel() {
    const login = location.pathname.match(CHANNEL_PATH)?.[1].toLowerCase();
    if (!login || !document.querySelector('.channel-root--live')) return null;
    const id = `twitch:${login}`;
    return state.favorites.find((c) => c.id === id) ?? { id, platform: 'twitch', login, name: login, avatar: '' };
  }

  // What's playing now, which a dropped channel goes beside.
  function playingEntries() {
    if (state.multi) return state.multi.entries;
    if (state.openId) {
      const channel = state.channels.find((c) => c.id === state.openId);
      return channel ? [entryFor(channel, shared.openStream()?.videoId)] : [];
    }
    const twitch = currentTwitchChannel();
    return twitch ? [entryFor(twitch)] : [];
  }

  function playingChannels() {
    if (state.multi) return state.multi.entries.map((e) => e.channel);
    if (state.openId) return [state.channels.find((c) => c.id === state.openId)].filter(Boolean);
    return [currentTwitchChannel()].filter(Boolean);
  }

  // Nothing to go beside, so it opens the normal way.
  function openAlone(channel) {
    if (platformOf(channel) === 'twitch') shared.openTwitchChannel(channel);
    else shared.navigateTo(channel.id);
  }

  function dropMessage(channel, playing) {
    if (playing.some((e) => e.id === channel.id)) return `${channel.name} is already open`;
    if (!playing.length) return `Drop to watch ${channel.name}`;
    if (playing.length >= MAX_MULTI_STREAMS) return `Up to ${MAX_MULTI_STREAMS} streams: drop on one to replace it`;
    return `Drop to watch ${channel.name} side by side (${playing.length + 1} of ${MAX_MULTI_STREAMS})`;
  }

  // Frames take in a drag and never tell the page, so this covers them while one is going on.
  function showDrop(channel) {
    const playing = playingEntries();
    const alreadyOpen = playing.some((e) => e.id === channel.id);
    const full = playing.length >= MAX_MULTI_STREAMS;
    dropOverlay = el(
      'div',
      { class: `${DROP_CLASS}${alreadyOpen ? ` ${DROP_CLASS}--refused` : ''}` },
      el('p', { class: `${DROP_CLASS}__message` }, dropMessage(channel, playing)),
    );
    placeRoot(dropOverlay, false);
    if (!full || alreadyOpen || !state.multi) return;

    const { left, top } = dropOverlay.getBoundingClientRect();
    for (const entry of state.multi.entries) {
      const rect = entry.cell.getBoundingClientRect();
      const tile = el('div', { class: `${DROP_CLASS}__tile`, 'data-skek-replace': entry.id }, el('span', {}, `Replace ${entry.channel.name}`));
      place(tile, { x: rect.left - left, y: rect.top - top, w: rect.width, h: rect.height });
      dropOverlay.append(tile);
    }
  }

  function dropAccepts(event, channel) {
    if (!dropOverlay || !event.target.closest?.(`.${DROP_CLASS}`)) return false;
    const playing = playingEntries();
    if (playing.some((e) => e.id === channel.id)) return false;
    return playing.length < MAX_MULTI_STREAMS || !!event.target.closest(`.${DROP_CLASS}__tile`);
  }

  function dropMark(event) {
    const tile = event.target.closest(`.${DROP_CLASS}__tile`);
    (tile ?? dropOverlay).classList.add(`${DROP_CLASS}--over`);
  }

  function dropClearMarks() {
    for (const node of document.querySelectorAll(`.${DROP_CLASS}--over`)) node.classList.remove(`${DROP_CLASS}--over`);
  }

  function dropChannel(event, channel) {
    const playing = playingEntries();
    if (!playing.length) {
      openAlone(channel);
      return;
    }
    // Keeps its name for the moment before its site says more.
    knownChannels.set(channel.id, channel);
    for (const known of playingChannels()) knownChannels.set(known.id, known);

    const added = entryFor(channel, streamsOf(state.live[channel.id])[0]?.videoId);
    const replacing = event.target.closest(`.${DROP_CLASS}__tile`)?.dataset.skekReplace;
    shared.showMulti(replacing ? playing.map((e) => (e.id === replacing ? added : e)) : [...playing, added]);
  }

  function hideDrop() {
    dropOverlay?.remove();
    dropOverlay = null;
  }

  // Captured first, so Alt+T doesn't also switch Twitch's own player behind the view. The other two
  // modes need a whole stream, so there's nothing for them to do here.
  addEventListener(
    'keydown',
    (event) => {
      const { multi } = state;
      if (!multi) return;
      if (moving && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        endMove(false);
        return;
      }
      // Ctrl is left out because AltGr reports as Ctrl+Alt on Windows.
      const shortcut = event.altKey && !event.ctrlKey && ['KeyT', 'KeyS', 'KeyC'].includes(event.code) ? event.code : null;
      if (!shortcut && !(event.key === 'Escape' && multi.full)) return;
      event.preventDefault();
      event.stopPropagation();
      if (shortcut === 'KeyT') setFull(!multi.full);
      else if (!shortcut) setFull(false);
    },
    true,
  );

  // The frames report keys and a click on their own mute button, which never reach this page.
  addEventListener('message', (event) => {
    const { multi } = state;
    if (!multi || ![...multi.root.querySelectorAll('iframe')].some((node) => node.contentWindow === event.source)) return;
    const message = event.data?.skekFrame;
    if (message === 'toggle-theatre') setFull(!multi.full);
    else if (message === 'exit-theatre' && multi.full) setFull(false);
    else if (message === 'audio') {
      const entry = multi.entries.find((e) => e.playerFrame?.contentWindow === event.source);
      if (!entry) return;
      if (!event.data.muted) setAudio(entry.id);
      else if (multi.audioId === entry.id) setAudio(null);
    }
  });

  onBodyReady(() => {
    shared.registerDropTarget({
      start: showDrop,
      end: hideDrop,
      accepts: dropAccepts,
      mark: dropMark,
      clearMarks: dropClearMarks,
      drop: dropChannel,
    });
  });

  Object.assign(shared, {
    syncMulti,
    closeMulti,
    updateMulti,
    placeMulti,
    multiTwitchLogins: () => state.multi?.entries.filter((e) => e.platform === 'twitch').map((e) => e.key) ?? [],
  });
})();
