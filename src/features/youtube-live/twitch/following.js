// Twitch's Following page: the "YouTube live" section and the YouTube tab.
(() => {
  'use strict';

  const yt = skek.youtube;
  const { el, isPlainClick } = skek.helpers;
  const { state, liveChannels, avatarImg, compact, uptime } = yt;

  const FOLLOWING_YOUTUBE_PATH = '/directory/following/youtube';
  const PAGES_WITH_YOUTUBE_SECTION = ['/directory/following', '/directory/following/live'];

  let lastFollowingRender = '';
  let lastInlineRender = '';

  function buildFollowingTab(list) {
    const model = [...list.children].find((li) => li.querySelector('a[aria-selected="false"]')) ?? list.children[0];
    const li = model.cloneNode(true);
    li.id = 'skek-following-tab';
    li.querySelector('[class*="ScTabIndicatorLayout"]')?.remove();
    const link = li.querySelector('a');
    for (const attr of ['id', 'aria-controls', 'data-index', 'tabindex']) link.removeAttribute(attr);
    link.setAttribute('data-a-target', 'following-youtube-tab');
    link.setAttribute('href', FOLLOWING_YOUTUBE_PATH);
    (link.querySelector('[class*="ScTitle"]') ?? link).textContent = 'YouTube';
    link.addEventListener('click', (event) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      if (location.pathname === FOLLOWING_YOUTUBE_PATH) return;
      history.pushState(yt.stateWithRoute(null), '', FOLLOWING_YOUTUBE_PATH);
      yt.syncWithUrl();
    });
    return li;
  }

  function streamCard(channel, live) {
    const started = uptime(live.startedAt).replace(/:\d\d$/, '');
    return el(
      'a',
      {
        class: 'skek-stream',
        href: `https://www.youtube.com/watch?v=${live.videoId}`,
        on: { click: (event) => yt.openOnPlainClick(event, channel.id) },
      },
      el(
        'span',
        { class: 'skek-stream__thumb' },
        el('img', {
          class: 'skek-stream__img',
          src: `https://i.ytimg.com/vi/${encodeURIComponent(live.videoId)}/hqdefault_live.jpg`,
          alt: '',
          referrerPolicy: 'no-referrer',
        }),
        el('span', { class: 'skek-stream__badge' }, 'LIVE'),
        started ? el('span', { class: 'skek-stream__uptime' }, started) : null,
        live.viewers == null
          ? null
          : el('span', { class: 'skek-stream__viewers' }, `${compact(live.viewers)} viewers`),
      ),
      el(
        'span',
        { class: 'skek-stream__info' },
        avatarImg(channel, 'skek-stream__avatar'),
        el(
          'span',
          { class: 'skek-stream__text' },
          el('span', { class: 'skek-stream__title', title: live.title }, live.title),
          el('span', { class: 'skek-stream__line' }, channel.name),
          el('span', { class: 'skek-stream__line' }, live.category),
        ),
      ),
    );
  }

  function offlineCard(channel) {
    return el(
      'a',
      {
        class: 'skek-offline-card',
        href: `https://www.youtube.com/channel/${channel.id}`,
        target: '_blank',
        rel: 'noopener',
      },
      avatarImg(channel, 'skek-offline-card__avatar'),
      el(
        'span',
        { class: 'skek-stream__text' },
        el('span', { class: 'skek-stream__title' }, channel.name),
        el('span', { class: 'skek-stream__line' }, 'Offline'),
      ),
    );
  }

  function renderYoutubeTab(panelEl) {
    const live = liveChannels();
    const offline = state.own.filter((c) => !state.live[c.id]);
    const parts = [
      el(
        'div',
        { class: 'skek-following__head' },
        el('h3', { class: 'skek-following__title' }, 'Live channels'),
        el(
          'button',
          { class: 'skek-button skek-manager-toggle', type: 'button', on: { click: yt.toggleManager } },
          el('span', {}, 'Manage channels'),
        ),
      ),
      live.length
        ? el('div', { class: 'skek-following__grid' }, ...live.map((c) => streamCard(c, state.live[c.id])))
        : el(
            'p',
            { class: 'skek-following__empty' },
            state.channels.length
              ? 'None of your YouTube channels are live right now.'
              : 'Add a YouTube channel and it will show up here when it goes live.',
          ),
      offline.length ? el('h3', { class: 'skek-following__title skek-following__title--spaced' }, 'Offline channels') : null,
      offline.length ? el('div', { class: 'skek-following__grid' }, ...offline.map(offlineCard)) : null,
    ];
    panelEl.replaceChildren(...parts.filter(Boolean));
  }

  // Directly under Twitch's "Live channels" block on the Overview and Live pages.
  function placeInlineSection(sectionEl, content) {
    // Twitch's headings sit in a <header>; ours doesn't, so it can't match itself here.
    const header = content.querySelector('header h3')?.closest('header');
    const block = header?.parentElement;
    // Twitch only wraps a heading and its cards in a block of their own for Live channels.
    const isLiveBlock =
      block &&
      block !== content &&
      block.querySelectorAll('header').length === 1 &&
      block.querySelector('[data-a-target="preview-card-image-link"]');

    if (isLiveBlock) {
      if (block.nextElementSibling !== sectionEl) block.after(sectionEl);
    } else if (header) {
      if (header.previousElementSibling !== sectionEl) header.before(sectionEl);
    } else if (content.firstElementChild !== sectionEl) {
      content.prepend(sectionEl);
    }

    // Same card width as Twitch's, which depends on the window size.
    const card = content.querySelector('article [data-a-target="preview-card-image-link"]');
    const width = card ? `${Math.round(card.getBoundingClientRect().width)}px` : '';
    if (sectionEl.style.getPropertyValue('--skek-card-width') !== width) {
      sectionEl.style.setProperty('--skek-card-width', width);
    }
  }

  function renderInlineSection(content) {
    let sectionEl = document.getElementById('skek-inline-section');
    const channels = content ? liveChannels() : [];
    if (!channels.length) {
      sectionEl?.remove();
      return;
    }
    if (!sectionEl) {
      sectionEl = el('div', { id: 'skek-inline-section', class: 'skek-inline' });
      lastInlineRender = '';
    }
    placeInlineSection(sectionEl, content);

    const signature = JSON.stringify(channels.map((c) => [c, state.live[c.id]]));
    if (signature === lastInlineRender) return;
    lastInlineRender = signature;
    sectionEl.replaceChildren(
      el('h3', { class: 'skek-following__title skek-inline__title' }, 'YouTube live'),
      el('div', { class: 'skek-inline__grid' }, ...channels.map((c) => streamCard(c, state.live[c.id]))),
    );
  }

  function renderFollowing() {
    const path = location.pathname.replace(/\/$/, '');
    const active = path === FOLLOWING_YOUTUBE_PATH;
    document.documentElement.classList.toggle('skek-youtube-tab-open', active);

    const overview = document.querySelector('[data-a-target="following-overview-tab"]');
    const list = overview?.closest('ul');
    if (!list) {
      renderInlineSection(null);
      return;
    }

    if (document.getElementById('skek-following-tab')?.parentElement !== list) {
      document.getElementById('skek-following-tab')?.remove();
      list.append(buildFollowingTab(list));
    }
    document.querySelector('#skek-following-tab a').setAttribute('aria-selected', String(active));

    const tabs = list.closest('.tw-tabs')?.parentElement;
    const content = tabs?.parentElement?.querySelector(':scope > section:not(.skek-following)');
    if (!content) return;
    content.classList.toggle('skek-hidden', active);
    renderInlineSection(PAGES_WITH_YOUTUBE_SECTION.includes(path) ? content : null);

    let panelEl = document.getElementById('skek-youtube-tab');
    if (!active) {
      panelEl?.remove();
      lastFollowingRender = '';
      return;
    }
    if (!panelEl) {
      panelEl = el('section', { id: 'skek-youtube-tab', class: 'skek-following' });
      lastFollowingRender = '';
    }
    if (content.nextElementSibling !== panelEl) content.after(panelEl);

    const signature = JSON.stringify([state.channels, state.live]);
    if (signature !== lastFollowingRender) {
      lastFollowingRender = signature;
      renderYoutubeTab(panelEl);
    }
  }

  Object.assign(yt, { renderFollowing });
})();
