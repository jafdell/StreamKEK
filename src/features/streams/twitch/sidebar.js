// The "YouTube Live" and "Kick Live" sections of Twitch's sidebar.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, icon, send } = skek.helpers;
  const { state, sites, channelsOn, liveChannels, platformOf, siteOf, streamsOf, avatarImg, compact } = shared;

  // Twitch's channels first, then each site in the order sites.js has them.
  const SECTIONS = Object.entries(sites).map(([platform, { section }]) => ({ platform, ...section }));
  const lastRender = {};

  function sidebarHost() {
    return document.querySelector('[data-a-target="side-nav-bar"] .side-bar-contents nav') ||
      document.querySelector('[data-a-target="side-nav-bar"] .side-bar-contents');
  }

  function canHide(channel) {
    if (state.openId === channel.id) return false;
    const { own, followed } = state.bySite[platformOf(channel)];
    return !!followed[channel.id] && !own.some((c) => c.id === channel.id);
  }

  // Only for subscriptions and followed channels: channels you added are removed in the manager.
  // Not on the stream open in this tab, because hiding it would close it. Another tab can still
  // close its stream this way, like removing the channel does.
  function hideButton(channel) {
    if (!canHide(channel)) return null;
    const label = `Hide ${channel.name}`;
    const type = `${siteOf(channel).messagePrefix}:hide`;
    return el(
      'button',
      {
        class: 'skek-iconbtn skek-card__hide',
        type: 'button',
        title: label,
        ariaLabel: label,
        on: {
          click: (event) => {
            // It's inside the card's link, which would open the stream.
            event.preventDefault();
            event.stopPropagation();
            // The next card moves under the cursor, so a double-click would hide that too.
            if (event.detail > 1) return;
            shared.hideTip();
            send({ type, id: channel.id });
          },
          // A middle click would open the link.
          auxclick: (event) => event.preventDefault(),
        },
      },
      icon('hide'),
    );
  }

  function renderCard(channel) {
    const live = state.live[channel.id];
    return el(
      'a',
      {
        class: `skek-card${state.openId === channel.id ? ' skek-card--active' : ''}`,
        href: siteOf(channel).streamUrl(channel, live),
        on: {
          click: (event) => shared.openOnPlainClick(event, channel.id),
          mouseenter: (event) => shared.showTip(event.currentTarget, channel, live),
          mouseleave: shared.hideTipSoon,
        },
      },
      el('span', { class: 'skek-card__avatar' }, avatarImg(channel, 'skek-card__img')),
      el(
        'span',
        { class: 'skek-card__text' },
        el(
          'span',
          { class: 'skek-card__name-row' },
          el('span', { class: 'skek-card__name' }, channel.name),
          streamsOf(live).length > 1 ? el('span', { class: 'skek-card__more' }, `+${streamsOf(live).length - 1}`) : null,
        ),
        el('span', { class: 'skek-card__meta' }, live.category),
      ),
      el(
        'span',
        { class: 'skek-card__live' },
        el('span', { class: 'skek-dot' }),
        el('span', {}, live.viewers == null ? 'Live' : compact(live.viewers)),
      ),
      hideButton(channel),
    );
  }

  // The first site goes directly under Followed Channels, so Twitch channels stay first. Each
  // other site goes under the one before, which stays in the page even when its setting hides it.
  function placeSection(section, host, previous) {
    if (previous) {
      if (previous.nextElementSibling !== section) previous.after(section);
      return;
    }
    const native = [...host.querySelectorAll('.side-nav-section')];
    const followed = native.find((s) => s.querySelector('[data-test-selector="followed-channel"]'));
    if (followed) {
      if (followed.nextElementSibling !== section) followed.after(section);
    } else if (native[0]) {
      // Later sites' sections sit between this one and Twitch's. Moving past them would make them
      // move back, which counts as a page change and renders again, forever.
      let before = native[0].previousElementSibling;
      while (before?.classList.contains('skek-section') && before !== section) before = before.previousElementSibling;
      if (before !== section) native[0].before(section);
    } else if (!section.isConnected) {
      host.prepend(section);
    }
  }

  function buildSection({ id, title, glyph }) {
    return el(
      'div',
      { id, class: 'skek-section' },
      el(
        'div',
        { class: 'skek-section__head' },
        el('h3', { class: 'skek-section__title' }, title),
        el('span', { class: 'skek-section__glyph' }, icon(glyph)),
        el(
          'button',
          {
            class: 'skek-iconbtn skek-section__add skek-manager-toggle',
            type: 'button',
            title: 'Manage channels',
            ariaLabel: 'Manage channels',
            on: { click: shared.toggleManager },
          },
          icon('plus'),
        ),
      ),
      el('div', { class: 'skek-section__list' }),
    );
  }

  function renderSection(config, host, previous, force) {
    let section = document.getElementById(config.id);
    let rebuilt = force;
    if (!section) {
      section = buildSection(config);
      rebuilt = true;
    }
    placeSection(section, host, previous);

    const { platform } = config;
    const signature = JSON.stringify([state.bySite[platform].own, channelsOn(platform), state.live, state.openId]);
    if (!rebuilt && signature === lastRender[platform]) return section;
    lastRender[platform] = signature;

    shared.hideTipUnlessHovered();
    const cards = liveChannels(platform).map(renderCard);
    const list = section.querySelector('.skek-section__list');
    if (cards.length) list.replaceChildren(...cards);
    else {
      list.replaceChildren(
        el(
          'p',
          { class: 'skek-section__empty' },
          channelsOn(platform).length ? 'No channels live right now' : 'Press + to add a channel',
        ),
      );
    }
    return section;
  }

  function renderSidebar(force) {
    const host = sidebarHost();
    if (!host) return;
    let previous = null;
    for (const config of SECTIONS) previous = renderSection(config, host, previous, force);
  }

  Object.assign(yt, { renderSidebar });
})();
