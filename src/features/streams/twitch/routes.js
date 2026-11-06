// Keeps the address bar and the open stream in step.
(() => {
  'use strict';

  const shared = skek.streams;
  const { isPlainClick } = skek.helpers;
  const { state, sites, platformOf, siteOf, parseMultiHash, multiHash } = shared;

  // A route is what follows the first / in these addresses: /<route prefix>/<channel>, plus
  // whatever else the site's routeTail allows, like /yt/<channel>/<video id> for a stream you
  // picked from the list.
  const siteEntries = Object.entries(sites);
  const routePatterns = siteEntries.map(([, { routePrefix, routeTail = '' }]) => `${routePrefix}/[^/]+${routeTail}`);
  const STREAM_PATH = new RegExp(`^/(${routePatterns.join('|')})/?$`);
  const SHORTENED_PATHS = siteEntries.map(([, { routePrefix }]) => `/${routePrefix}`);
  const FALLBACK_PATH = '/directory/following';

  // Twitch's router doesn't see pushState, so it keeps the page you came from behind
  // the view. It only sees /yt/... or /kick/... on a reload or back/forward, where it renders
  // its not-found page and shortens the address to /yt or /kick, sometimes before our popstate
  // listener runs. So each history entry also records its route in its state, and
  // twitchPageLost tracks whether Twitch has left the page you came from.
  //
  // The multi-stream view's address is the Following page, with its streams after the #. Not the
  // page you came from, because Twitch strips the # from a channel's page as it loads. Twitch's router
  // doesn't see this either, so the page you came from stays behind the view, and returnUrl says which.
  const isMultiUrl = () => parseMultiHash(location.hash).length > 0;

  // Read synchronously while this file loads, before Twitch can shorten the address. Never move this behind init, a promise or a timer.
  let currentRoute = location.pathname.match(STREAM_PATH)?.[1] ?? null;
  let twitchPageLost = !!currentRoute;
  let returnUrl = null;

  function slugFor(channel) {
    const name = channel.slug ?? channel.handle?.replace(/^@/, '') ?? channel.id;
    return encodeURIComponent(name.toLowerCase());
  }

  function routeFor(channel, videoId = null) {
    const route = `${siteOf(channel).routePrefix}/${slugFor(channel)}`;
    return videoId ? `${route}/${videoId}` : route;
  }

  function routeParts(route) {
    const [prefix, slug = '', videoId = null] = route.split('/');
    const platform = siteEntries.find(([, { routePrefix }]) => routePrefix === prefix)?.[0];
    const channel = state.channels.find((c) => platformOf(c) === platform && slugFor(c) === slug.toLowerCase());
    return { channel, videoId };
  }

  function stateWithRoute(route) {
    const { skekRoute: _old, ...rest } = history.state ?? {};
    return route ? { ...rest, skekRoute: route } : rest;
  }

  // What to go back to, unless this address is one of ours and Twitch's page is another.
  function rememberTwitchPage() {
    // Twitch accepts an address like //example.com/x, which would leave Twitch if sent back to.
    if (!location.pathname.match(STREAM_PATH) && !isMultiUrl()) returnUrl = location.pathname.replace(/^\/+/, '/') + location.search;
  }

  function navigateTo(id, videoId = null) {
    const channel = id && state.channels.find((c) => c.id === id);
    if (channel) {
      rememberTwitchPage();
      const route = routeFor(channel, videoId);
      history.pushState(stateWithRoute(route), '', `/${route}`);
    } else if (twitchPageLost) {
      // Twitch is on its not-found page, so this needs a real page load.
      location.assign(returnUrl ?? FALLBACK_PATH);
      return;
    } else {
      history.pushState(stateWithRoute(null), '', returnUrl ?? FALLBACK_PATH);
    }
    syncWithUrl();
  }

  // Twitch's router doesn't see pushState by itself, but it does follow popstate.
  function openTwitchChannel(channel) {
    history.pushState(stateWithRoute(null), '', `/${channel.login}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }

  // Opens the multi-stream view with these streams, or changes the ones in it, which isn't a new
  // history entry: Back leaves the view rather than undoing each stream.
  function showMulti(entries) {
    const url = `${FALLBACK_PATH}${multiHash(entries)}`;
    if (isMultiUrl()) {
      history.replaceState(history.state, '', url);
    } else {
      rememberTwitchPage();
      history.pushState(stateWithRoute(null), '', url);
    }
    syncWithUrl();
  }

  // Leaves the view for the one stream left in it, or the page behind it if there's none. A Twitch
  // stream that's the page behind it just carries on playing.
  function leaveMulti(channel, videoId = null) {
    if (!channel) navigateTo(null);
    else if (platformOf(channel) !== 'twitch') navigateTo(channel.id, videoId);
    else if (!twitchPageLost && returnUrl?.toLowerCase() === `/${channel.login}`) navigateTo(null);
    else openTwitchChannel(channel);
  }

  // Takes the view out of this history entry, so Back doesn't come straight back to it. Only for an
  // address that never opened a view, so Twitch's page is the one it names.
  function forgetMultiUrl() {
    history.replaceState(stateWithRoute(null), '', `${location.pathname}${location.search}`);
  }

  // Keeps the address up to date when a YouTube channel moves on to its next stream.
  function rememberMulti(entries) {
    const hash = multiHash(entries);
    if (location.hash !== hash) history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
    state.multi.hash = hash;
  }

  function forgetRouteVideo(channel) {
    const route = routeFor(channel);
    history.replaceState(stateWithRoute(route), '', `/${route}`);
    currentRoute = route;
  }

  function syncWithUrl() {
    // Only the route's own site: /kick from a YouTube stream is a Twitch channel you clicked.
    if (SHORTENED_PATHS.includes(location.pathname) && currentRoute?.startsWith(`${location.pathname.slice(1)}/`)) {
      if (state.channelsLoaded && !routeParts(currentRoute).channel) currentRoute = null;
      else {
        twitchPageLost = true;
        history.replaceState(stateWithRoute(currentRoute), '', `/${currentRoute}`);
      }
    }

    currentRoute = location.pathname.match(STREAM_PATH)?.[1] ?? null;
    const multi = parseMultiHash(location.hash);
    // The view's address hides what's behind it, so that hasn't changed.
    if (!currentRoute && !multi.length) twitchPageLost = false;

    shared.renderFollowing();
    if (!state.channelsLoaded) return;

    if (multi.length) {
      if (state.openId) shared.closeView();
      shared.syncMulti(multi, location.hash);
      return;
    }
    shared.closeMulti();

    const { channel, videoId } = currentRoute ? routeParts(currentRoute) : {};
    const id = channel?.id ?? null;
    if (!id) {
      if (state.openId) shared.closeView();
      return;
    }
    if (id === state.openId && videoId === state.routeVideoId) return;
    state.routeVideoId = videoId;
    shared.openView(id);
  }

  function openOnPlainClick(event, channelId, videoId = null) {
    // Let ctrl/middle click open the stream on YouTube or Kick as a normal link.
    if (!isPlainClick(event)) return;
    event.preventDefault();
    shared.hideTip();
    navigateTo(channelId, videoId);
  }

  // Registered from init in main.js, not here: its order relative to Twitch's own
  // popstate listener matters (see the note above).
  function handlePopState(event) {
    const saved = event.state?.skekRoute;
    // Routes saved by older versions have no site in them, and were all YouTube.
    const hasSite = (route) => SHORTENED_PATHS.some((path) => route.startsWith(`${path.slice(1)}/`));
    const route = (saved && !hasSite(saved) ? `yt/${saved}` : saved) ?? location.pathname.match(STREAM_PATH)?.[1];
    if (route) {
      currentRoute = route;
      twitchPageLost = true;
    } else if (isMultiUrl()) {
      // Twitch's router saw this one, so the Following page is behind the view now.
      returnUrl = null;
    }
    syncWithUrl();
  }

  Object.assign(shared, {
    navigateTo,
    syncWithUrl,
    stateWithRoute,
    forgetRouteVideo,
    openOnPlainClick,
    handlePopState,
    openTwitchChannel,
    showMulti,
    leaveMulti,
    forgetMultiUrl,
    rememberMulti,
  });
})();
