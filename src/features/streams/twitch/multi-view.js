// The multi-stream view: two to four streams at once, from any site, opened by dragging a channel from
// the sidebar onto the page. Its streams are in the address, like the stream view's, so reloading and
// Back work: routes.js reads it and calls syncMulti. Its sizes are worked out in multi-layout.js, and
// dragging between streams changes them until the number of streams changes or the page reloads.
// Every frame stays where it was put in this element and only its position changes, because moving a
// frame in the page would reload it.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, icon, onBodyReady } = skek.helpers;
  const { state, platformOf, siteOf, streamsOf, compact, frame, chatSettings, placeRoot, pauseTwitchVideos, resumeTwitchVideos, multiLayout, swapStreams, askPictureInPicture, MAX_MULTI_STREAMS, CHANNEL_PATH } = shared;

  const VIEW_ID = 'skek-view';
  const PLAYER_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  const CHAT_ALLOW = 'clipboard-write';
  const MUTED_MARK = '#skek-muted';
  const TICK_MS = 500;
  const TITLE = 'Multi-stream - Twitch';
  const DROP_CLASS = 'skek-drop';
  const MOVING_CLASS = 'skek-multi--moving';
  const RESIZING_CLASS = 'skek-multi--resizing';
  const DIVIDER_ACTIVE_CLASS = 'skek-multi__divider--active';
  const CONTROLS_CLASS = 'skek-multi--controls';
  const UNDER_BAR_CLASS = 'skek-multi__cell--under-bar';
  // How long the bars stay after the mouse last moved, in fullscreen.
  const CONTROLS_MS = 3000;
  // The two dividers multi-layout.js can give. A divider's grip is this far to each side of its line,
  // and where two dividers meet a bigger grip drags both.
  const SPLITS = ['main', 'cross'];
  const DIVIDER_GRIP_PX = 4;
  const CORNER_GRIP_PX = 8;
  // Further than a click wanders, so a click on a stream's name still opens its channel.
  const MOVE_THRESHOLD_PX = 5;
  const HINT_ADD = 'Drag a channel from the sidebar to add it.';
  const HINT_MOVE = "Drag a stream's name onto another to swap them.";
  const HINT_RESIZE = 'Drag between streams to resize them.';

  // Channels seen in a drag, for their name until their site has said more. Lasts for this page.
  const knownChannels = new Map();

  let savedTitle = '';
  let tickTimer = null;
  let observer = null;
  let dropOverlay = null;
  // Where on it a dragged channel can be dropped: 'anywhere', only on its 'tiles', or 'nothing'.
  let dropTakes = 'nothing';
  // The part of it the drop would land on now: the overlay itself or one of its tiles.
  let dropOver = null;
  // The stream whose bar is being dragged, with what shows while it is.
  let moving = null;
  let layoutQueued = false;
  let controlsTimer = null;
  // Where the mouse last was on the screen.
  let lastMouse = '';

  // The icon is only replaced when it changes, so the sound bars don't restart their animation each
  // time the layout is worked out again, which happens many times while the window is resized.
  function setButton(button, label, iconName) {
    if (button.title !== label) {
      button.title = label;
      button.ariaLabel = label;
    }
    if (button.dataset.skekIcon === iconName) return;
    button.dataset.skekIcon = iconName;
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
    const { stage, picker, bar } = multi.refs;
    const layout = multiLayout({
      count: multi.entries.length,
      width: stage.clientWidth,
      height: stage.clientHeight,
      chat: !multi.chatHidden,
      splits: multi.splits,
      bars: !isFullscreen(),
    });
    multi.sharedChat = !!layout.chat;
    multi.dividers = layout.dividers;

    // For fullscreen, where the view's bar lies over the streams: it stops where a chat beside them
    // starts, and the streams at the top have their own bars under it. See multi-view.css.
    bar.style.right = layout.picker?.x ? `${stage.clientWidth - layout.picker.x}px` : '';
    const barHeight = bar.offsetHeight;

    multi.entries.forEach((entry, i) => {
      place(entry.cell, layout.players[i]);
      entry.cell.classList.toggle(UNDER_BAR_CLASS, layout.players[i].y < barHeight);
      if (layout.chats) showChat(entry, layout.chats[i]);
      else if (layout.chat && entry.id === multi.chatId) showChat(entry, layout.chat);
      else place(entry.chatBox, null);
      updateEntryButtons(entry);
    });
    place(picker, layout.picker);
    if (layout.picker) renderPicker();
    placeDividers(layout.dividers);
  }

  function placeDividers(dividers) {
    const { refs } = state.multi;
    for (const split of SPLITS) {
      const divider = dividers.find((d) => d.split === split);
      const grip = refs[`${split}Divider`];
      if (!divider) {
        place(grip, null);
        continue;
      }
      const sideways = divider.axis === 'x';
      grip.dataset.skekAxis = divider.axis;
      grip.ariaOrientation = sideways ? 'vertical' : 'horizontal';
      place(
        grip,
        sideways
          ? { x: divider.x - DIVIDER_GRIP_PX, y: divider.y, w: DIVIDER_GRIP_PX * 2, h: divider.h }
          : { x: divider.x, y: divider.y - DIVIDER_GRIP_PX, w: divider.w, h: DIVIDER_GRIP_PX * 2 },
      );
    }
    const upright = dividers.find((d) => d.axis === 'x');
    const level = dividers.find((d) => d.axis === 'y');
    const meet = upright && level ? { x: upright.x - CORNER_GRIP_PX, y: level.y - CORNER_GRIP_PX, w: CORNER_GRIP_PX * 2, h: CORNER_GRIP_PX * 2 } : null;
    place(refs.cornerDivider, meet);
  }

  // A drag asks for a new layout far more often than the screen is drawn.
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      applyLayout();
    });
  }

  // Dragging a divider makes the streams on one side bigger and the others smaller. It holds on to the
  // pointer, so the frames it passes over can't take the mouse, and it ends however the pointer goes.
  function beginResize(event, splits) {
    const { multi } = state;
    const along = (divider, e) => (divider.axis === 'x' ? e.clientX : e.clientY);
    // With where on the grip each was caught, so a divider doesn't jump to the pointer.
    const dragged = multi.dividers
      .filter((divider) => splits.includes(divider.split) && divider.length)
      .map((divider) => ({ divider, offset: along(divider, event) - (divider.axis === 'x' ? divider.x : divider.y) }));
    if (event.button !== 0 || !dragged.length) return;
    const grip = event.currentTarget;
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    const onMove = (e) => {
      if (state.multi !== multi) return;
      for (const { divider, offset } of dragged) multi.splits[divider.split] = (along(divider, e) - offset - divider.start) / divider.length;
      queueLayout();
    };
    multi.root.classList.add(RESIZING_CLASS);
    grip.classList.add(DIVIDER_ACTIVE_CLASS);
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener(
      'lostpointercapture',
      () => {
        grip.removeEventListener('pointermove', onMove);
        grip.classList.remove(DIVIDER_ACTIVE_CLASS);
        multi.root.classList.remove(RESIZING_CLASS);
      },
      { once: true },
    );
  }

  function resetSplits(splits) {
    for (const split of splits) state.multi.splits[split] = null;
    applyLayout();
  }

  function buildDivider(className, splits) {
    return el('div', {
      class: `skek-multi__divider ${className}`,
      role: 'separator',
      title: 'Drag to resize the streams. Double-click to reset.',
      on: { pointerdown: (event) => beginResize(event, splits), dblclick: () => resetSplits(splits) },
    });
  }

  // Only built again when it would read differently, since the layout is worked out again for every
  // frame of a drag between streams.
  function renderPicker() {
    const { multi } = state;
    const shows = JSON.stringify([multi.chatId, multi.entries.map((entry) => [entry.id, entry.channel.name])]);
    if (shows === multi.pickerShows) return;
    multi.pickerShows = shows;
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
    setButton(refs.audio, hasSound ? 'Mute this stream' : 'Listen to this stream', hasSound ? 'soundBars' : 'speakerOff');
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
      { id: VIEW_ID, class: 'skek-view skek-multi', on: { mousemove: onMouseMove } },
      ref(
        'bar',
        el(
          'div',
          { class: 'skek-multi__bar' },
          el('h2', { class: 'skek-multi__title' }, 'Multi-stream'),
          ref('hint', el('span', { class: 'skek-multi__hint' })),
          el('span', { class: 'skek-multi__spacer' }),
          ref('chatToggle', barButton('', () => setChatHidden(!state.multi.chatHidden))),
          ref('fullToggle', barButton('', () => setFull(!state.multi.full))),
          ref('screenToggle', barButton('', toggleFullscreen)),
          ref('close', barButton('', () => shared.leaveMulti(null))),
        ),
      ),
      ref(
        'stage',
        el(
          'div',
          { class: 'skek-multi__stage' },
          ref('picker', el('div', { class: 'skek-multi__picker' })),
          ...SPLITS.map((split) => ref(`${split}Divider`, buildDivider('', [split]))),
          ref('cornerDivider', buildDivider('skek-multi__divider--corner', SPLITS)),
        ),
      ),
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
    // Nothing would show for it in fullscreen, only once that ends.
    if (isFullscreen()) return;
    multi.full = full;
    multi.root.classList.toggle('skek-view--full-window', full);
    setButton(multi.refs.fullToggle, full ? 'Exit theatre mode (Alt+T)' : 'Theatre mode (Alt+T)', 'theatre');
    multi.refs.fullToggle.classList.toggle('skek-multi__button--on', full);
    placeMulti();
  }

  // Real fullscreen for the whole view, streams and chats together. A player's own fullscreen button
  // still shows that stream alone, on top of this, and leaving it comes back here.
  // The streams get the whole screen then: the view's bar and each stream's bar lie over the video
  // instead of above it, which multi-view.css does, and only show while the mouse moves.
  function isFullscreen() {
    return !!state.multi?.root.matches(':fullscreen');
  }

  function toggleFullscreen() {
    const done = isFullscreen() ? document.exitFullscreen() : state.multi.root.requestFullscreen();
    // Refused, or already gone. The button says which it is.
    done.catch(() => {});
  }

  function showControls() {
    if (!isFullscreen()) return;
    state.multi.root.classList.add(CONTROLS_CLASS);
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => state.multi?.root.classList.remove(CONTROLS_CLASS), CONTROLS_MS);
  }

  // Over anything of this page's. A player's frame says so itself: frames/mouse-activity.js.
  // The browser can also report a move when only the page under a still mouse changed, as when the
  // bars go, and that isn't one.
  function onMouseMove({ screenX, screenY }) {
    const at = `${screenX},${screenY}`;
    if (at === lastMouse) return;
    lastMouse = at;
    showControls();
  }

  // Theatre mode has nothing to change in fullscreen, so its button goes while that's on, and setFull
  // leaves it as it was.
  function updateFullscreen() {
    const { multi } = state;
    if (!multi) return;
    const on = isFullscreen();
    setButton(multi.refs.screenToggle, on ? 'Exit fullscreen' : 'Fullscreen', on ? 'fullscreenExit' : 'fullscreen');
    multi.refs.screenToggle.classList.toggle('skek-multi__button--on', on);
    multi.refs.fullToggle.hidden = on;
    clearTimeout(controlsTimer);
    multi.root.classList.remove(CONTROLS_CLASS);
    showControls();
    applyLayout();
  }

  document.addEventListener('fullscreenchange', updateFullscreen);

  function placeMulti() {
    if (state.multi) placeRoot(state.multi.root, state.multi.full);
  }

  function openMulti() {
    const { root, refs } = buildRoot();
    state.multi = { root, refs, entries: [], dividers: [], splits: {}, hash: '', audioId: null, windowId: null, chatId: null, chatHidden: false, full: false, sharedChat: false, started: false, pickerShows: '' };
    savedTitle = document.title;
    setChatHidden(false);
    setFull(false);
    updateFullscreen();
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
    clearTimeout(controlsTimer);
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
    // Another number of streams is laid out another way, so what was dragged no longer means the same.
    if (previous.length !== multi.entries.length) multi.splits = {};
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

    multi.refs.hint.textContent = `${multi.entries.length < MAX_MULTI_STREAMS ? `${HINT_ADD} ` : ''}${HINT_MOVE} ${HINT_RESIZE}`;
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

  // Frames take in a drag and never tell the page, so this covers them while one is going on. What
  // it would take is worked out once here, for the whole drag: see sidebar-drag.js.
  function showDrop(channel) {
    const playing = playingEntries();
    const alreadyOpen = playing.some((e) => e.id === channel.id);
    const full = playing.length >= MAX_MULTI_STREAMS;
    dropOverlay = el(
      'div',
      { class: `${DROP_CLASS}${alreadyOpen ? ` ${DROP_CLASS}--refused` : ''}` },
      el('p', { class: `${DROP_CLASS}__message` }, dropMessage(channel, playing)),
    );
    dropTakes = alreadyOpen ? 'nothing' : full ? 'tiles' : 'anywhere';
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

  function dropAccepts(event) {
    if (!dropOverlay || dropTakes === 'nothing' || !event.target.closest?.(`.${DROP_CLASS}`)) return false;
    return dropTakes === 'anywhere' || !!event.target.closest(`.${DROP_CLASS}__tile`);
  }

  function dropMark(event) {
    const over = event.target.closest(`.${DROP_CLASS}__tile`) ?? dropOverlay;
    if (over === dropOver) return;
    dropClearMarks();
    dropOver = over;
    over.classList.add(`${DROP_CLASS}--over`);
  }

  function dropClearMarks() {
    dropOver?.classList.remove(`${DROP_CLASS}--over`);
    dropOver = null;
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
    dropClearMarks();
    dropOverlay?.remove();
    dropOverlay = null;
  }

  // Alt+P is for the stream whose picture-in-picture window is open, to close it. With none open,
  // it's for the stream the key was pressed over, the only one the browser lets open a window, or
  // else the one with the sound, or the first that's playing. frames/picture-in-picture.js says
  // which stream's window is open.
  function pictureInPictureFrame(pressedIn) {
    const { entries, audioId, windowId } = state.multi;
    const playing = entries.filter((e) => e.playerFrame);
    return (playing.find((e) => e.id === windowId) ?? pressedIn ?? playing.find((e) => e.id === audioId) ?? playing[0])?.playerFrame;
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
      const shortcut = event.altKey && !event.ctrlKey && ['KeyT', 'KeyS', 'KeyC', 'KeyP'].includes(event.code) ? event.code : null;
      if (!shortcut && !(event.key === 'Escape' && multi.full)) return;
      event.preventDefault();
      event.stopPropagation();
      if (shortcut === 'KeyT') setFull(!multi.full);
      else if (shortcut === 'KeyP') askPictureInPicture(pictureInPictureFrame());
      else if (!shortcut) setFull(false);
    },
    true,
  );

  // The frames report the mouse, keys and a click on their own mute button, which never reach this page.
  addEventListener('message', (event) => {
    const { multi } = state;
    if (!multi || ![...multi.root.querySelectorAll('iframe')].some((node) => node.contentWindow === event.source)) return;
    const message = event.data?.skekFrame;
    if (message === 'activity') showControls();
    else if (message === 'toggle-theatre') setFull(!multi.full);
    else if (message === 'exit-theatre' && multi.full) setFull(false);
    else if (message === 'toggle-picture-in-picture') {
      askPictureInPicture(pictureInPictureFrame(multi.entries.find((e) => e.playerFrame?.contentWindow === event.source)));
    } else if (message === 'picture-in-picture') {
      // One stream's window opening closes another's, and the two can report in either order.
      const entry = multi.entries.find((e) => e.playerFrame?.contentWindow === event.source);
      if (!entry) return;
      if (event.data.open === true) multi.windowId = entry.id;
      else if (multi.windowId === entry.id) multi.windowId = null;
    } else if (message === 'audio') {
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
