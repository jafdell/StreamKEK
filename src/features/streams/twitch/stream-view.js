// The Twitch-style stream view for other sites: its info bar, and opening and closing it. Its two
// frames are in view-frames.js, and its theatre, stacked and floating modes in view-layouts.js.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, icon, send } = skek.helpers;
  const { state, openStream, platformOf, siteOf, uptime, loadStream, showOverlay, toggleLayout } = shared;

  const VIEW_ID = 'skek-view';

  const paused = new Set();

  function pauseTwitchVideos() {
    for (const video of document.querySelectorAll('video')) {
      if (!video.paused) {
        paused.add(video);
        video.pause();
      }
    }
  }

  function resumeTwitchVideos() {
    for (const video of paused) if (video.isConnected) video.play().catch(() => {});
    paused.clear();
  }

  function buildView() {
    const refs = {};
    const ref = (name, node) => ((refs[name] = node), node);

    const root = el(
      'div',
      { id: VIEW_ID, class: 'skek-view' },
      el(
        'div',
        { class: 'skek-main', on: { mousemove: showOverlay } },
        ref('player', el('div', { class: 'skek-player' })),
        el(
          'div',
          { class: 'skek-info' },
          el(
            'div',
            { class: 'skek-info__avatar' },
            ref('avatar', el('img', { class: 'skek-info__img', alt: '', referrerPolicy: 'no-referrer' })),
            ref('badge', el('span', { class: 'skek-info__badge' }, 'LIVE')),
          ),
          el(
            'div',
            { class: 'skek-info__body' },
            el(
              'div',
              { class: 'skek-info__row' },
              ref('name', el('a', { class: 'skek-info__name', target: '_blank', rel: 'noopener' })),
              el(
                'div',
                { class: 'skek-info__actions' },
                ref(
                  'floatingButton',
                  el(
                    'button',
                    {
                      class: 'skek-button skek-button--icon',
                      type: 'button',
                      ariaLabel: 'Floating chat',
                      'data-skek-tooltip': 'StreamKEK (Alt+C)',
                      on: { click: () => toggleLayout('floating') },
                    },
                    icon('floating'),
                  ),
                ),
                ref(
                  'stackedButton',
                  el(
                    'button',
                    {
                      class: 'skek-button skek-button--icon',
                      type: 'button',
                      ariaLabel: 'Stacked mode',
                      'data-skek-tooltip': 'StreamKEK (Alt+S)',
                      on: { click: () => toggleLayout('stacked') },
                    },
                    icon('stacked'),
                  ),
                ),
                ref(
                  'theatreButton',
                  el(
                    'button',
                    {
                      class: 'skek-button skek-button--icon',
                      type: 'button',
                      ariaLabel: 'Theatre mode',
                      'data-skek-tooltip': 'StreamKEK (Alt+T)',
                      on: { click: () => toggleLayout('theatre') },
                    },
                    icon('theatre'),
                  ),
                ),
                ref(
                  'external',
                  el(
                    'a',
                    { class: 'skek-button', target: '_blank', rel: 'noopener', 'data-skek-tooltip': 'StreamKEK' },
                    icon('external'),
                    ref('externalLabel', el('span', {})),
                  ),
                ),
              ),
            ),
            el(
              'div',
              { class: 'skek-info__row' },
              el(
                'div',
                { class: 'skek-info__text' },
                ref('title', el('p', { class: 'skek-info__title' })),
                ref('category', el('p', { class: 'skek-info__category' })),
              ),
              el(
                'div',
                { class: 'skek-info__stats' },
                el('span', { class: 'skek-stat skek-stat--viewers' }, icon('person'), ref('viewers', el('span', {}))),
                el('span', { class: 'skek-stat' }, icon('clock'), ref('uptime', el('span', {}))),
              ),
            ),
          ),
        ),
        ref(
          'reopen',
          el(
            'button',
            {
              class: 'skek-iconbtn skek-reopen',
              type: 'button',
              title: 'Expand chat',
              ariaLabel: 'Expand chat',
              on: { click: () => setChatHidden(false) },
            },
            icon('expand'),
          ),
        ),
      ),
      el(
        'aside',
        { class: 'skek-chat' },
        el(
          'div',
          { class: 'skek-chat__head' },
          el(
            'button',
            {
              class: 'skek-iconbtn',
              type: 'button',
              title: 'Collapse chat',
              ariaLabel: 'Collapse chat',
              on: { click: () => setChatHidden(true) },
            },
            icon('collapse'),
          ),
          el('h2', { class: 'skek-chat__title' }, 'Stream Chat'),
          el('span', { class: 'skek-chat__spacer' }),
        ),
        ref('chat', el('div', { class: 'skek-chat__body' })),
      ),
    );
    return { root, refs, streamKey: undefined, layout: null };
  }

  const detailsRequested = new Set();

  function updateInfo() {
    const { view } = state;
    if (!view || !state.openId) return;
    const { refs } = view;
    const channel = state.channels.find((c) => c.id === state.openId);
    const live = state.live[state.openId];
    const stream = openStream();

    // The stream in the address has ended, but the channel has another.
    if (stream && state.routeVideoId && stream.videoId !== state.routeVideoId) {
      state.routeVideoId = null;
      shared.forgetRouteVideo(channel);
    }
    state.pinnedVideoId = stream?.videoId ?? null;
    loadStream(channel, stream);

    const site = siteOf(channel);
    if (site.loadsDetails && stream && !stream.startedAt && !detailsRequested.has(stream.videoId)) {
      detailsRequested.add(stream.videoId);
      send({ type: `${site.messagePrefix}:loadStreamDetails`, channelId: state.openId, videoId: stream.videoId });
    }

    const channelUrl = channel ? site.channelUrl(channel) : '';
    refs.avatar.src = channel?.avatar || '';
    refs.name.textContent = channel?.name ?? '';
    refs.name.href = channelUrl;
    refs.external.href = stream && channel ? site.streamUrl(channel, stream) : channelUrl;
    refs.external.className = `skek-button skek-button--${platformOf(channel)}`;
    refs.externalLabel.textContent = `Watch on ${site.name}`;
    refs.title.textContent = stream?.title ?? 'Offline';
    refs.title.title = stream?.title ?? '';
    refs.category.textContent = stream?.category ?? live?.category ?? '';
    refs.viewers.textContent = stream?.viewers == null ? '' : stream.viewers.toLocaleString();
    refs.uptime.textContent = uptime(stream?.startedAt);
    view.root.classList.toggle('skek-view--offline', !stream);
    view.title = `${channel?.name ?? site.name} - Twitch`;
    document.title = view.title;
  }

  function setChatHidden(hidden) {
    state.chatHidden = hidden;
    state.view?.root.classList.toggle('skek-view--chat-hidden', hidden);
    chrome.storage.local.set({ chatHidden: hidden });
  }

  function placeView() {
    const { view } = state;
    const main = document.querySelector('main.twilight-main, main');
    if (!view || !main) return;
    const mainRect = main.getBoundingClientRect();
    const nav = document.querySelector('[data-a-target="side-nav-bar"]');
    const left = nav ? nav.getBoundingClientRect().right : mainRect.left;
    const { style } = view.root;
    style.left = view.layout ? '0' : `${left}px`;
    style.top = view.layout ? '0' : `${mainRect.top}px`;
    style.height = view.layout ? '100%' : `${mainRect.height}px`;
    style.width = view.layout ? '100%' : `${document.documentElement.clientWidth - left}px`;

    // Sits beside Twitch's own layout so its menus keep opening above us.
    const parent = main.parentElement;
    if (view.root.parentElement !== parent) parent.append(view.root);
  }

  let tickTimer = null;
  let savedTitle = '';

  function openView(id) {
    const channelKnown = state.channels.some((c) => c.id === id);
    if (!channelKnown) return;
    if (!state.view) {
      state.view = buildView();
      savedTitle = document.title;
      state.view.root.classList.toggle('skek-view--chat-hidden', state.chatHidden);
      placeView();
      tickTimer = setInterval(() => {
        placeView();
        pauseTwitchVideos();
        const stream = openStream();
        const { view } = state;
        if (view && stream) view.refs.uptime.textContent = uptime(stream.startedAt);
        if (view?.title && document.title !== view.title) document.title = view.title;
      }, 500);
    }
    if (state.openId !== id) state.pinnedVideoId = null;
    state.openId = id;
    pauseTwitchVideos();
    updateInfo();
    shared.renderSidebar();
  }

  function closeView() {
    clearInterval(tickTimer);
    skek.floatingWindow.close();
    state.view?.root.remove();
    state.view = null;
    state.openId = null;
    state.routeVideoId = null;
    state.pinnedVideoId = null;
    if (savedTitle) document.title = savedTitle;
    resumeTwitchVideos();
    shared.renderSidebar();
  }

  Object.assign(shared, { updateInfo, placeView, openView, closeView });
})();
