// The Favorites section at the top of Twitch's sidebar: channels from Twitch, YouTube and Kick
// together, in the order you drag them. A favorite leaves its usual list while it's up here.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, icon, isPlainClick, onBodyReady } = skek.helpers;
  const { state, platformOf, siteOf, streamsOf, avatarImg, compact } = shared;

  const SECTION_ID = 'skek-favorites';
  // Twitch's attributes on these cards are missing while the sidebar is collapsed, unlike the classes.
  const TWITCH_CARD = '[data-test-selector="side-nav"] .side-nav-card a[href]';
  const OUR_CARD = '.skek-card[data-skek-channel]';
  // The collapsed sidebar's is side-nav-bar-collapsed.
  const SIDEBAR = '[data-a-target^="side-nav-bar"]';
  // Only a channel's card has one part to its address. Categories have more, like /directory/category/x.
  const CHANNEL_PATH = /^\/(\w+)\/?$/;
  const HIDDEN_CARD = 'data-skek-favorite';
  const DRAGGING = 'data-skek-dragging';
  const GQL_URL = 'https://gql.twitch.tv/gql';
  // Twitch's own website's public id, which needs no sign-in. Nothing else reads a channel that isn't
  // in the sidebar's list, and if this stops working the cards just don't say whether they're live.
  const GQL_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const GQL_QUERY = 'query($logins:[String!]){users(logins:$logins){login displayName profileImageURL(width:70) stream{viewersCount title game{displayName}}}}';
  const GQL_MAX_LOGINS = 100;
  const REFRESH_MS = 60_000;

  // What Twitch last said about each Twitch favorite, by id. A channel missing here is unknown, not offline.
  let twitchStatus = {};
  let lastRender = null;
  let dragged = null;
  // The star on the Twitch card under the mouse. Only one, since it goes into Twitch's own markup.
  let twitchStar = null;

  const isFavorite = (channel) => state.favorites.some((c) => c.id === channel.id);

  function moveFavorite(list, channel, beforeId) {
    const rest = list.filter((c) => c.id !== channel.id);
    const at = rest.findIndex((c) => c.id === beforeId);
    return at < 0 ? [...rest, channel] : [...rest.slice(0, at), channel, ...rest.slice(at)];
  }

  function twitchStatusFrom(users) {
    const status = {};
    for (const user of users ?? []) {
      if (!user?.login) continue;
      const { stream } = user;
      status[`twitch:${user.login}`] = {
        name: user.displayName,
        avatar: user.profileImageURL,
        live: stream
          ? {
              title: stream.title ?? '',
              category: stream.game?.displayName ?? '',
              viewers: stream.viewersCount ?? null,
              thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.login}-440x248.jpg`,
            }
          : null,
      };
    }
    return status;
  }

  // Live channels first, then offline ones, each in your order. Unknown counts as live, so a card
  // doesn't move once Twitch has answered.
  function liveFirst(cards) {
    return [...cards.filter((card) => !card.offline), ...cards.filter((card) => card.offline)];
  }

  // A favorite as it is now. Its saved copy is only for when its site has nothing newer to say.
  function cardInfo(favorite) {
    if (platformOf(favorite) === 'twitch') {
      const status = twitchStatus[favorite.id];
      const { name = favorite.name, avatar = favorite.avatar } = status ?? {};
      return { channel: { ...favorite, name, avatar }, live: status?.live ?? null, offline: !!status && !status.live };
    }
    const channel = state.channels.find((c) => c.id === favorite.id);
    const live = channel ? state.live[channel.id] : null;
    return { channel: channel ?? favorite, live: live ?? null, offline: !live };
  }

  function watchingTwitchLogin() {
    return document.getElementById('skek-view') ? null : location.pathname.split('/')[1]?.toLowerCase();
  }

  function isActive(channel) {
    return platformOf(channel) === 'twitch' ? channel.login === watchingTwitchLogin() : state.openId === channel.id;
  }

  function save(favorites) {
    chrome.storage.local.set({ favoriteChannels: favorites });
  }

  function starButton(channel) {
    const on = isFavorite(channel);
    const label = on ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`;
    return el(
      'button',
      {
        class: `skek-iconbtn skek-star${on ? ' skek-star--on' : ''}`,
        type: 'button',
        title: label,
        ariaLabel: label,
        on: {
          click: (event) => {
            // On our own cards it's inside the link, which would open the stream.
            event.preventDefault();
            event.stopPropagation();
            shared.hideTip();
            save(on ? state.favorites.filter((c) => c.id !== channel.id) : [...state.favorites, channel]);
          },
          // A middle click would open the link.
          auxclick: (event) => event.preventDefault(),
        },
      },
      icon(on ? 'star' : 'starOutline'),
    );
  }

  // Twitch's router doesn't see pushState by itself, but it does follow popstate.
  function openTwitchChannel(channel) {
    history.pushState(shared.stateWithRoute(null), '', `/${channel.login}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }

  function openFavorite(event, channel, live) {
    if (platformOf(channel) === 'twitch') {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      shared.hideTip();
      openTwitchChannel(channel);
    } else if (live) {
      shared.openOnPlainClick(event, channel.id);
    }
  }

  function linkProps({ channel, live }) {
    const site = siteOf(channel);
    if (live || platformOf(channel) === 'twitch') return { href: site.streamUrl(channel, live) };
    // There's nothing to show in the stream view, so an offline channel opens on its own site.
    return { href: site.channelUrl(channel), target: '_blank', rel: 'noopener' };
  }

  function statusOf({ live, offline }) {
    if (offline) return el('span', { class: 'skek-card__live skek-card__live--offline' }, 'Offline');
    if (!live) return null;
    return el(
      'span',
      { class: 'skek-card__live' },
      el('span', { class: 'skek-dot' }),
      el('span', {}, live.viewers == null ? 'Live' : compact(live.viewers)),
    );
  }

  function renderCard(card) {
    const { channel, live, offline } = card;
    const platform = platformOf(channel);
    const streams = streamsOf(live);
    return el(
      'a',
      {
        class: `skek-card skek-card--favorite${isActive(channel) ? ' skek-card--active' : ''}${offline ? ' skek-card--offline' : ''}`,
        'data-skek-channel': channel.id,
        ...linkProps(card),
        ...(live ? {} : { title: channel.name }),
        on: {
          click: (event) => openFavorite(event, channel, live),
          mouseenter: (event) => {
            if (live) shared.showTip(event.currentTarget, channel, live);
          },
          mouseleave: shared.hideTipSoon,
        },
      },
      el(
        'span',
        { class: 'skek-card__avatar' },
        avatarImg(channel, 'skek-card__img'),
        el('span', { class: `skek-card__platform skek-card__platform--${platform}`, title: siteOf(channel).name }, icon(platform)),
      ),
      el(
        'span',
        { class: 'skek-card__text' },
        el(
          'span',
          { class: 'skek-card__name-row' },
          el('span', { class: 'skek-card__name' }, channel.name),
          streams.length > 1 ? el('span', { class: 'skek-card__more' }, `+${streams.length - 1}`) : null,
        ),
        live ? el('span', { class: 'skek-card__meta' }, live.category) : null,
      ),
      statusOf(card),
      starButton(channel),
    );
  }

  function buildSection() {
    return el(
      'div',
      { id: SECTION_ID, class: 'skek-section' },
      el(
        'div',
        { class: 'skek-section__head' },
        el('h3', { class: 'skek-section__title' }, 'Favorites'),
        el('span', { class: 'skek-section__glyph' }, icon('star')),
      ),
      el('div', { class: 'skek-section__list' }),
    );
  }

  // Above Followed Channels. Logged out, other sites' sections sit right above Twitch's first list,
  // so it goes above those. Moving it only when it's in the wrong place keeps this from causing
  // a page change, which would render again, forever.
  function placeSection(section, host) {
    const native = host.querySelector('.side-nav-section');
    if (!native) {
      if (!section.isConnected) host.prepend(section);
      return;
    }
    let first = native;
    while (first.previousElementSibling?.classList.contains('skek-section')) first = first.previousElementSibling;
    if (first !== section) first.before(section);
  }

  function twitchCardChannel(link) {
    const login = link.pathname.match(CHANNEL_PATH)?.[1].toLowerCase();
    if (!login) return null;
    const id = `twitch:${login}`;
    const name = link.querySelector('[data-a-target="side-nav-title"]')?.textContent.trim() || login;
    return state.favorites.find((c) => c.id === id) ?? { id, platform: 'twitch', login, name, avatar: link.querySelector('img')?.src ?? '' };
  }

  // Twitch's list isn't ours to take a card out of, so a favorite's card is hidden there. This runs
  // only once the section is in the page, so a Twitch markup change can't lose a channel. In the
  // collapsed sidebar the link is itself a .side-nav-card, so that's what gets hidden there.
  function hideTwitchCards() {
    for (const link of document.querySelectorAll(TWITCH_CARD)) {
      const card = link.closest('.side-nav-card');
      const login = link.pathname.match(CHANNEL_PATH)?.[1].toLowerCase();
      const favorite = !!login && isFavorite({ id: `twitch:${login}` });
      if (card.hasAttribute(HIDDEN_CARD) !== favorite) card.toggleAttribute(HIDDEN_CARD, favorite);
    }
  }

  function renderFavorites(host, force) {
    let section = document.getElementById(SECTION_ID);
    let rebuilt = force;
    if (!section) {
      section = buildSection();
      rebuilt = true;
    }
    placeSection(section, host);
    hideTwitchCards();

    const signature = JSON.stringify([state.favorites, state.channels, state.live, twitchStatus, state.openId, watchingTwitchLogin()]);
    if (!rebuilt && signature === lastRender) return;
    lastRender = signature;

    shared.hideTipUnlessHovered();
    const list = section.querySelector('.skek-section__list');
    const cards = liveFirst(state.favorites.map(cardInfo)).map(renderCard);
    section.classList.toggle('skek-section--no-favorites', !cards.length);
    if (cards.length) list.replaceChildren(...cards);
    else list.replaceChildren(el('p', { class: 'skek-section__empty' }, 'Drop a channel here'));
  }

  async function refreshTwitchStatus() {
    const logins = state.favorites.filter((c) => platformOf(c) === 'twitch').map((c) => c.login);
    if (!logins.length || document.hidden) return;
    try {
      const response = await fetch(GQL_URL, {
        method: 'POST',
        headers: { 'Client-Id': GQL_CLIENT },
        body: JSON.stringify({ query: GQL_QUERY, variables: { logins: logins.slice(0, GQL_MAX_LOGINS) } }),
      });
      const { data } = await response.json();
      if (!data?.users) return;
      twitchStatus = twitchStatusFrom(data.users);
      shared.renderSidebar();
    } catch {
      // Keeps what it last knew until the next try.
    }
  }

  function showStar(event) {
    const link = event.target.closest?.(TWITCH_CARD);
    // The collapsed sidebar has no room for a star.
    if (!link || dragged || link.closest('.side-nav--collapsed')) return;
    const channel = twitchCardChannel(link);
    if (!channel) return;
    const card = link.closest('.side-nav-card');
    // It can be out of date when a card comes back after leaving Favorites.
    if (twitchStar?.parentElement === card && twitchStar.classList.contains('skek-star--on') === isFavorite(channel)) return;
    twitchStar?.remove();
    twitchStar = starButton(channel);
    card.append(twitchStar);
  }

  function clearDropMarks() {
    for (const card of document.querySelectorAll('.skek-card--drop-before, .skek-card--drop-after')) {
      card.classList.remove('skek-card--drop-before', 'skek-card--drop-after');
    }
  }

  function draggedChannel(target) {
    const ours = target.closest?.(OUR_CARD);
    if (ours) {
      const id = ours.dataset.skekChannel;
      return state.favorites.find((c) => c.id === id) ?? state.channels.find((c) => c.id === id) ?? null;
    }
    const link = target.closest?.(TWITCH_CARD);
    return link ? twitchCardChannel(link) : null;
  }

  // The card the drop would go in front of, or null for the end of the list.
  function cardBelow(section, y) {
    const cards = [...section.querySelectorAll(OUR_CARD)].filter((card) => card.dataset.skekChannel !== dragged.id);
    return cards.find((card) => {
      const { top, height } = card.getBoundingClientRect();
      return y < top + height / 2;
    }) ?? null;
  }

  // Also the gap above the section, so dragging all the way to the top of the sidebar still counts.
  function isOverFavorites(event, section) {
    if (!section) return false;
    return section.contains(event.target) || (!!event.target.closest?.(SIDEBAR) && event.clientY <= section.getBoundingClientRect().bottom);
  }

  function onDragStart(event) {
    const channel = draggedChannel(event.target);
    if (!channel) return;
    dragged = channel;
    shared.hideTip();
    const card = event.target.closest(`${OUR_CARD}, .side-nav-card`);
    const { left, top } = card.getBoundingClientRect();
    // Otherwise the browser drags the link's address, or only the avatar.
    event.dataTransfer.setDragImage(card, event.clientX - left, event.clientY - top);
    event.dataTransfer.effectAllowed = 'all';
    // The browser cancels a drag if the page changes while it's starting.
    setTimeout(() => {
      if (dragged) document.documentElement.toggleAttribute(DRAGGING, true);
    });
  }

  function onDragOver(event) {
    if (!dragged) return;
    clearDropMarks();
    const section = document.getElementById(SECTION_ID);
    if (isOverFavorites(event, section)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const below = cardBelow(section, event.clientY);
      if (below) below.classList.add('skek-card--drop-before');
      else [...section.querySelectorAll(OUR_CARD)].at(-1)?.classList.add('skek-card--drop-after');
    } else if (isFavorite(dragged) && event.target.closest?.(SIDEBAR)) {
      // Dropping a favorite anywhere else in the sidebar takes it out.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function onDrop(event) {
    if (!dragged) return;
    const section = document.getElementById(SECTION_ID);
    if (isOverFavorites(event, section)) {
      event.preventDefault();
      save(moveFavorite(state.favorites, dragged, cardBelow(section, event.clientY)?.dataset.skekChannel));
    } else if (isFavorite(dragged) && event.target.closest?.(SIDEBAR)) {
      event.preventDefault();
      save(state.favorites.filter((c) => c.id !== dragged.id));
    }
    endDrag();
  }

  function endDrag() {
    if (!dragged) return;
    dragged = null;
    document.documentElement.removeAttribute(DRAGGING);
    clearDropMarks();
    shared.renderSidebar();
  }

  onBodyReady(() => {
    document.addEventListener('dragstart', onDragStart, true);
    // The browser asks with dragenter on reaching an element, and only with dragover after that,
    // so a quick drop is refused unless both say yes.
    document.addEventListener('dragenter', onDragOver, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', endDrag, true);
    // A card Twitch replaced mid-drag never reports dragend, and the mouse doesn't move during a drag.
    document.addEventListener('mousemove', endDrag, true);
    document.addEventListener('mouseover', showStar);
    setInterval(refreshTwitchStatus, REFRESH_MS);
  });

  Object.assign(shared, {
    isFavorite,
    moveFavorite,
    twitchStatusFrom,
    liveFirst,
    starButton,
    renderFavorites,
    refreshTwitchStatus,
    isDragging: () => !!dragged,
  });
})();
