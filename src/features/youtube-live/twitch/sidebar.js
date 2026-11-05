// The "YouTube Live" section of Twitch's sidebar.
(() => {
  'use strict';

  const yt = skek.youtube;
  const { el, icon, send } = skek.helpers;
  const { state, liveChannels, streamsOf, avatarImg, compact } = yt;

  const SECTION_ID = 'skek-section';
  let lastRender = '';

  function sidebarHost() {
    return document.querySelector('[data-a-target="side-nav-bar"] .side-bar-contents nav') ||
      document.querySelector('[data-a-target="side-nav-bar"] .side-bar-contents');
  }

  // Only for subscriptions: channels you added are removed in the manager. Not on the
  // stream open in this tab, because hiding it would close it. Another tab can still close
  // its stream this way, like removing the channel does.
  function hideButton(channel) {
    if (state.openId === channel.id || !state.subs[channel.id] || state.own.some((c) => c.id === channel.id)) return null;
    const label = `Hide ${channel.name}`;
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
            yt.hideTip();
            send({ type: 'youtube-live:hide', id: channel.id });
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
        href: `https://www.youtube.com/watch?v=${live.videoId}`,
        on: {
          click: (event) => yt.openOnPlainClick(event, channel.id),
          mouseenter: (event) => yt.showTip(event.currentTarget, channel, live),
          mouseleave: yt.hideTipSoon,
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

  // Directly under Followed Channels, so Twitch channels stay first.
  function placeSection(section, host) {
    const native = [...host.querySelectorAll('.side-nav-section')];
    const followed = native.find((s) => s.querySelector('[data-test-selector="followed-channel"]'));
    if (followed) {
      if (followed.nextElementSibling !== section) followed.after(section);
    } else if (native[0]) {
      if (native[0].previousElementSibling !== section) native[0].before(section);
    } else if (!section.isConnected) {
      host.prepend(section);
    }
  }

  function renderSidebar(force) {
    const host = sidebarHost();
    if (!host) return;

    let section = document.getElementById(SECTION_ID);
    if (!section) {
      section = el(
        'div',
        { id: SECTION_ID, class: 'skek-section' },
        el(
          'div',
          { class: 'skek-section__head' },
          el('h3', { class: 'skek-section__title' }, 'YouTube Live'),
          el('span', { class: 'skek-section__glyph' }, icon('youtube')),
          el(
            'button',
            {
              class: 'skek-iconbtn skek-section__add skek-manager-toggle',
              type: 'button',
              title: 'Manage YouTube channels',
              ariaLabel: 'Manage YouTube channels',
              on: { click: yt.toggleManager },
            },
            icon('plus'),
          ),
        ),
        el('div', { class: 'skek-section__list' }),
      );
      force = true;
    }
    placeSection(section, host);

    const signature = JSON.stringify([state.own, state.channels, state.live, state.openId]);
    if (!force && signature === lastRender) return;
    lastRender = signature;

    yt.hideTipUnlessHovered();
    const cards = liveChannels().map(renderCard);
    const list = section.querySelector('.skek-section__list');
    if (cards.length) list.replaceChildren(...cards);
    else {
      list.replaceChildren(
        el(
          'p',
          { class: 'skek-section__empty' },
          state.channels.length ? 'No channels live right now' : 'Press + to add a channel',
        ),
      );
    }
  }

  Object.assign(yt, { renderSidebar });
})();
