// The Favorites section at the top of Twitch's sidebar: live channels from Twitch, YouTube and Kick
// together, in the order you drag them. A favorite leaves its usual list while it's up here. Offline
// ones aren't shown, like the sections for YouTube and Kick. A Twitch one stays in Twitch's own list,
// where its star removes it.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, icon, isPlainClick, onBodyReady } = skek.helpers;
  const { state, platformOf, siteOf, streamsOf, avatarImg, compact, openIds, TWITCH_CARD, CHANNEL_PATH, twitchCardChannel } = shared;

  const SECTION_ID = 'skek-favorites';
  const OUR_CARD = '.skek-card[data-skek-channel]';
  // The collapsed sidebar's is side-nav-bar-collapsed.
  const SIDEBAR = '[data-a-target^="side-nav-bar"]';
  const HIDDEN_CARD = 'data-skek-favorite';
  const GQL_URL = 'https://gql.twitch.tv/gql';
  // Twitch's own website's public id, which needs no sign-in. Nothing else reads a channel that isn't
  // in the sidebar's list, and if this stops working Twitch favorites just stay in Twitch's own list.
  const GQL_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const GQL_QUERY = 'query($logins:[String!]){users(logins:$logins){login displayName profileImageURL(width:70) stream{viewersCount title game{displayName}}}}';
  const GQL_MAX_LOGINS = 100;
  const REFRESH_MS = 60_000;

  // What Twitch last said about each Twitch favorite, and each Twitch stream in the multi-stream view,
  // by id. Only a favorite it says is live gets a card.
  let twitchStatus = {};
  let lastRender = null;
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

  // A favorite as it is now. Its saved copy is only for when its site has nothing newer to say.
  function cardInfo(favorite) {
    if (platformOf(favorite) === 'twitch') {
      const status = twitchStatus[favorite.id];
      const { name = favorite.name, avatar = favorite.avatar } = status ?? {};
      return { channel: { ...favorite, name, avatar }, live: status?.live ?? null };
    }
    const channel = state.channels.find((c) => c.id === favorite.id);
    return { channel: channel ?? favorite, live: (channel && state.live[channel.id]) ?? null };
  }

  function watchingTwitchLogin() {
    return document.getElementById('skek-view') ? null : location.pathname.split('/')[1]?.toLowerCase();
  }

  function isActive(channel) {
    return openIds().includes(channel.id) || (platformOf(channel) === 'twitch' && channel.login === watchingTwitchLogin());
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

  function openFavorite(event, channel) {
    if (platformOf(channel) !== 'twitch') {
      shared.openOnPlainClick(event, channel.id);
      return;
    }
    if (!isPlainClick(event)) return;
    event.preventDefault();
    shared.hideTip();
    shared.openTwitchChannel(channel);
  }

  function renderCard({ channel, live }) {
    const platform = platformOf(channel);
    const streams = streamsOf(live);
    return el(
      'a',
      {
        class: `skek-card skek-card--favorite${isActive(channel) ? ' skek-card--active' : ''}`,
        'data-skek-channel': channel.id,
        href: siteOf(channel).streamUrl(channel, live),
        on: {
          click: (event) => openFavorite(event, channel),
          mouseenter: (event) => shared.showTip(event.currentTarget, channel, live),
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
        el('span', { class: 'skek-card__meta' }, live.category),
      ),
      el(
        'span',
        { class: 'skek-card__live' },
        el('span', { class: 'skek-dot' }),
        el('span', {}, live.viewers == null ? 'Live' : compact(live.viewers)),
      ),
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

  // Twitch's list isn't ours to take a card out of, so a favorite's card is hidden there while it has
  // a card in Favorites. Otherwise it's the only place left to find that channel and its star. This
  // runs only once the section is in the page, so a Twitch markup change can't lose a channel. In the
  // collapsed sidebar the link is itself a .side-nav-card, so that's what gets hidden there.
  function hideTwitchCards() {
    for (const link of document.querySelectorAll(TWITCH_CARD)) {
      const card = link.closest('.side-nav-card');
      const login = link.pathname.match(CHANNEL_PATH)?.[1].toLowerCase();
      const id = `twitch:${login}`;
      const hide = !!login && isFavorite({ id }) && !!twitchStatus[id]?.live;
      if (card.hasAttribute(HIDDEN_CARD) !== hide) card.toggleAttribute(HIDDEN_CARD, hide);
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

    const signature = JSON.stringify([state.favorites, state.channels, state.live, twitchStatus, openIds(), watchingTwitchLogin()]);
    if (!rebuilt && signature === lastRender) return;
    lastRender = signature;

    shared.hideTipUnlessHovered();
    const list = section.querySelector('.skek-section__list');
    const cards = state.favorites.map(cardInfo).filter((card) => card.live).map(renderCard);
    section.classList.toggle('skek-section--no-live-favorites', !cards.length);
    if (cards.length) list.replaceChildren(...cards);
    else list.replaceChildren(el('p', { class: 'skek-section__empty' }, 'Drop a channel here'));
  }

  async function refreshTwitchStatus() {
    const favorites = state.favorites.filter((c) => platformOf(c) === 'twitch').map((c) => c.login);
    const logins = [...new Set([...shared.multiTwitchLogins(), ...favorites])];
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
      shared.updateMulti();
    } catch {
      // Keeps what it last knew until the next try.
    }
  }

  function showStar(event) {
    const link = event.target.closest?.(TWITCH_CARD);
    // The collapsed sidebar has no room for a star.
    if (!link || shared.isDragging() || link.closest('.side-nav--collapsed')) return;
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

  // The card the drop would go in front of, or null for the end of the list.
  function cardBelow(section, y, channel) {
    const cards = [...section.querySelectorAll(OUR_CARD)].filter((card) => card.dataset.skekChannel !== channel.id);
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

  // Dropping a favorite anywhere else in the sidebar takes it out.
  const isOverRestOfSidebar = (event, channel) => isFavorite(channel) && !!event.target.closest?.(SIDEBAR);

  const favoritesTarget = {
    accepts: (event, channel) => isOverFavorites(event, document.getElementById(SECTION_ID)) || isOverRestOfSidebar(event, channel),
    mark(event, channel) {
      const section = document.getElementById(SECTION_ID);
      if (!isOverFavorites(event, section)) return;
      const below = cardBelow(section, event.clientY, channel);
      if (below) below.classList.add('skek-card--drop-before');
      else [...section.querySelectorAll(OUR_CARD)].at(-1)?.classList.add('skek-card--drop-after');
    },
    clearMarks: clearDropMarks,
    drop(event, channel) {
      const section = document.getElementById(SECTION_ID);
      if (isOverFavorites(event, section)) save(moveFavorite(state.favorites, channel, cardBelow(section, event.clientY, channel)?.dataset.skekChannel));
      else save(state.favorites.filter((c) => c.id !== channel.id));
    },
  };

  onBodyReady(() => {
    shared.registerDropTarget(favoritesTarget);
    document.addEventListener('mouseover', showStar);
    setInterval(refreshTwitchStatus, REFRESH_MS);
    // A tab opened in the background hasn't asked yet, and live favorites wait on the answer.
    document.addEventListener('visibilitychange', refreshTwitchStatus);
  });

  Object.assign(shared, {
    isFavorite,
    moveFavorite,
    twitchStatusFrom,
    starButton,
    renderFavorites,
    refreshTwitchStatus,
    twitchStatusOf: (id) => twitchStatus[id],
  });
})();
