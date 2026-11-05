// Twitch's Following page: the "YouTube live" and "Kick live" sections and their tabs.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, isPlainClick } = skek.helpers;
  const { state, channelsOn, liveChannels, siteOf, avatarImg, compact, uptime } = shared;

  const SITE_TABS = [
    {
      platform: 'youtube',
      path: '/directory/following/youtube',
      tabId: 'skek-following-tab',
      panelId: 'skek-youtube-tab',
      sectionId: 'skek-inline-section',
      siteName: 'YouTube',
      sectionTitle: 'YouTube live',
      ownChannels: () => state.own,
    },
    {
      platform: 'kick',
      path: '/directory/following/kick',
      tabId: 'skek-following-kick-tab',
      panelId: 'skek-kick-tab',
      sectionId: 'skek-kick-inline-section',
      siteName: 'Kick',
      sectionTitle: 'Kick live',
      ownChannels: () => state.kickOwn,
    },
  ];
  const PAGES_WITH_SITE_SECTIONS = ['/directory/following', '/directory/following/live'];

  const lastPanelRender = {};
  const lastInlineRender = {};

  function buildFollowingTab(list, { path, tabId, platform, siteName }) {
    const model = [...list.children].find((li) => li.querySelector('a[aria-selected="false"]')) ?? list.children[0];
    const li = model.cloneNode(true);
    li.id = tabId;
    li.classList.add('skek-following-tab');
    li.querySelector('[class*="ScTabIndicatorLayout"]')?.remove();
    const link = li.querySelector('a');
    for (const attr of ['id', 'aria-controls', 'data-index', 'tabindex']) link.removeAttribute(attr);
    link.setAttribute('data-a-target', `following-${platform}-tab`);
    link.setAttribute('href', path);
    (link.querySelector('[class*="ScTitle"]') ?? link).textContent = siteName;
    link.addEventListener('click', (event) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      if (location.pathname === path) return;
      history.pushState(shared.stateWithRoute(null), '', path);
      shared.syncWithUrl();
    });
    return li;
  }

  function streamCard(channel, live) {
    const started = uptime(live.startedAt).replace(/:\d\d$/, '');
    const site = siteOf(channel);
    return el(
      'a',
      {
        class: 'skek-stream',
        href: site.streamUrl(channel, live),
        on: { click: (event) => shared.openOnPlainClick(event, channel.id) },
      },
      el(
        'span',
        { class: 'skek-stream__thumb' },
        el('img', {
          class: 'skek-stream__img',
          src: site.previewUrl(live),
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
        href: siteOf(channel).channelUrl(channel),
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

  function renderSiteTab(panelEl, { platform, siteName, ownChannels }) {
    const live = liveChannels(platform);
    const offline = ownChannels().filter((c) => !state.live[c.id]);
    const parts = [
      el(
        'div',
        { class: 'skek-following__head' },
        el('h3', { class: 'skek-following__title' }, 'Live channels'),
        el(
          'button',
          { class: 'skek-button skek-manager-toggle', type: 'button', on: { click: shared.toggleManager } },
          el('span', {}, 'Manage channels'),
        ),
      ),
      live.length
        ? el('div', { class: 'skek-following__grid' }, ...live.map((c) => streamCard(c, state.live[c.id])))
        : el(
            'p',
            { class: 'skek-following__empty' },
            channelsOn(platform).length
              ? `None of your ${siteName} channels are live right now.`
              : `Add a ${siteName} channel and it will show up here when it goes live.`,
          ),
      offline.length ? el('h3', { class: 'skek-following__title skek-following__title--spaced' }, 'Offline channels') : null,
      offline.length ? el('div', { class: 'skek-following__grid' }, ...offline.map(offlineCard)) : null,
    ];
    panelEl.replaceChildren(...parts.filter(Boolean));
  }

  // Directly under Twitch's "Live channels" block on the Overview and Live pages, or under the
  // section before it, so the order stays Twitch, YouTube, Kick.
  function placeInlineSection(sectionEl, content, previous) {
    // Twitch's headings sit in a <header>; ours doesn't, so it can't match itself here.
    const header = content.querySelector('header h3')?.closest('header');
    const block = header?.parentElement;
    // Twitch only wraps a heading and its cards in a block of their own for Live channels.
    const isLiveBlock =
      block &&
      block !== content &&
      block.querySelectorAll('header').length === 1 &&
      block.querySelector('[data-a-target="preview-card-image-link"]');

    if (previous) {
      if (previous.nextElementSibling !== sectionEl) previous.after(sectionEl);
    } else if (isLiveBlock) {
      if (block.nextElementSibling !== sectionEl) block.after(sectionEl);
    } else if (header) {
      // Kick's section can sit between this one and the header. Moving past it would make it
      // move back, which counts as a page change and renders again, forever.
      const before = header.previousElementSibling;
      const skipKick = before?.id === 'skek-kick-inline-section' && before !== sectionEl;
      if ((skipKick ? before.previousElementSibling : before) !== sectionEl) header.before(sectionEl);
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

  // Returns the section, if it's showing, for the next one to go under.
  function renderInlineSection(content, previous, { platform, sectionId, sectionTitle }) {
    let sectionEl = document.getElementById(sectionId);
    const channels = content ? liveChannels(platform) : [];
    if (!channels.length) {
      sectionEl?.remove();
      return previous;
    }
    if (!sectionEl) {
      sectionEl = el('div', { id: sectionId, class: 'skek-inline' });
      lastInlineRender[platform] = '';
    }
    placeInlineSection(sectionEl, content, previous);

    const signature = JSON.stringify(channels.map((c) => [c, state.live[c.id]]));
    if (signature === lastInlineRender[platform]) return sectionEl;
    lastInlineRender[platform] = signature;
    sectionEl.replaceChildren(
      el('h3', { class: 'skek-following__title skek-inline__title' }, sectionTitle),
      el('div', { class: 'skek-inline__grid' }, ...channels.map((c) => streamCard(c, state.live[c.id]))),
    );
    return sectionEl;
  }

  function renderInlineSections(content) {
    let previous = null;
    for (const tab of SITE_TABS) previous = renderInlineSection(content, previous, tab);
  }

  function renderPanel(content, tab, active) {
    let panelEl = document.getElementById(tab.panelId);
    if (!active) {
      panelEl?.remove();
      lastPanelRender[tab.platform] = '';
      return;
    }
    if (!panelEl) {
      panelEl = el('section', { id: tab.panelId, class: 'skek-following' });
      lastPanelRender[tab.platform] = '';
    }
    if (content.nextElementSibling !== panelEl) content.after(panelEl);

    const signature = JSON.stringify([channelsOn(tab.platform), state.live]);
    if (signature !== lastPanelRender[tab.platform]) {
      lastPanelRender[tab.platform] = signature;
      renderSiteTab(panelEl, tab);
    }
  }

  function renderFollowing() {
    const path = location.pathname.replace(/\/$/, '');
    const activeTab = SITE_TABS.find((tab) => tab.path === path);
    document.documentElement.classList.toggle('skek-site-tab-open', !!activeTab);

    const overview = document.querySelector('[data-a-target="following-overview-tab"]');
    const list = overview?.closest('ul');
    if (!list) {
      renderInlineSections(null);
      return;
    }

    for (const tab of SITE_TABS) {
      if (document.getElementById(tab.tabId)?.parentElement !== list) {
        document.getElementById(tab.tabId)?.remove();
        list.append(buildFollowingTab(list, tab));
      }
      const li = document.getElementById(tab.tabId);
      li.classList.toggle('skek-following-tab--active', tab === activeTab);
      li.querySelector('a').setAttribute('aria-selected', String(tab === activeTab));
    }

    const tabs = list.closest('.tw-tabs')?.parentElement;
    const content = tabs?.parentElement?.querySelector(':scope > section:not(.skek-following)');
    if (!content) return;
    content.classList.toggle('skek-hidden', !!activeTab);
    renderInlineSections(PAGES_WITH_SITE_SECTIONS.includes(path) ? content : null);
    for (const tab of SITE_TABS) renderPanel(content, tab, tab === activeTab);
  }

  Object.assign(yt, { renderFollowing });
})();
