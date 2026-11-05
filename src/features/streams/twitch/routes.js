// Keeps the address bar and the open stream in step.
(() => {
  'use strict';

  const shared = skek.streams;
  const { isPlainClick } = skek.helpers;
  const { state, sites, platformOf, siteOf } = shared;

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

  function navigateTo(id, videoId = null) {
    const channel = id && state.channels.find((c) => c.id === id);
    if (channel) {
      if (!location.pathname.match(STREAM_PATH)) returnUrl = location.pathname + location.search;
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
    if (!currentRoute) twitchPageLost = false;

    shared.renderFollowing();
    if (!state.channelsLoaded) return;

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
    }
    syncWithUrl();
  }

  Object.assign(shared, { navigateTo, syncWithUrl, stateWithRoute, forgetRouteVideo, openOnPlainClick, handlePopState });
})();
