// Keeps the address bar and the open stream in step.
(() => {
  'use strict';

  const yt = skek.youtube;
  const { isPlainClick } = skek.helpers;
  const { state } = yt;

  // /yt/<channel>, or /yt/<channel>/<video id> for a stream you picked from the list.
  const YT_PATH = /^\/yt\/([^/]+(?:\/[\w-]{11})?)\/?$/;
  const FALLBACK_PATH = '/directory/following';

  // Twitch's router doesn't see pushState, so it keeps the page you came from behind
  // the view. It only sees /yt/... on a reload or back/forward, where it renders
  // its not-found page and shortens the address to /yt, sometimes before our popstate
  // listener runs. So each history entry also records its route in its state, and
  // twitchPageLost tracks whether Twitch has left the page you came from.

  // Read synchronously while this file loads, before Twitch can shorten the address. Never move this behind init, a promise or a timer.
  let currentRoute = location.pathname.match(YT_PATH)?.[1] ?? null;
  let twitchPageLost = !!currentRoute;
  let returnUrl = null;

  function slugFor(channel) {
    return encodeURIComponent((channel.handle?.replace(/^@/, '') ?? channel.id).toLowerCase());
  }

  function routeParts(route) {
    const [slug, videoId = null] = route.split('/');
    return { channel: state.channels.find((c) => slugFor(c) === slug.toLowerCase()), videoId };
  }

  function stateWithRoute(route) {
    const { skekRoute: _old, ...rest } = history.state ?? {};
    return route ? { ...rest, skekRoute: route } : rest;
  }

  function navigateTo(id, videoId = null) {
    const channel = id && state.channels.find((c) => c.id === id);
    if (channel) {
      if (!location.pathname.match(YT_PATH)) returnUrl = location.pathname + location.search;
      const route = videoId ? `${slugFor(channel)}/${videoId}` : slugFor(channel);
      history.pushState(stateWithRoute(route), '', `/yt/${route}`);
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
    const route = slugFor(channel);
    history.replaceState(stateWithRoute(route), '', `/yt/${route}`);
    currentRoute = route;
  }

  function syncWithUrl() {
    if (location.pathname === '/yt' && currentRoute) {
      if (state.channelsLoaded && !routeParts(currentRoute).channel) currentRoute = null;
      else {
        twitchPageLost = true;
        history.replaceState(stateWithRoute(currentRoute), '', `/yt/${currentRoute}`);
      }
    }

    currentRoute = location.pathname.match(YT_PATH)?.[1] ?? null;
    if (!currentRoute) twitchPageLost = false;

    yt.renderFollowing();
    if (!state.channelsLoaded) return;

    const { channel, videoId } = currentRoute ? routeParts(currentRoute) : {};
    const id = channel?.id ?? null;
    if (!id) {
      if (state.openId) yt.closeView();
      return;
    }
    if (id === state.openId && videoId === state.routeVideoId) return;
    state.routeVideoId = videoId;
    yt.openView(id);
  }

  function openOnPlainClick(event, channelId, videoId = null) {
    // Let ctrl/middle click open the stream on YouTube as a normal link.
    if (!isPlainClick(event)) return;
    event.preventDefault();
    yt.hideTip();
    navigateTo(channelId, videoId);
  }

  // Registered from init in main.js, not here: its order relative to Twitch's own
  // popstate listener matters (see the note above).
  function handlePopState(event) {
    const route = event.state?.skekRoute ?? location.pathname.match(YT_PATH)?.[1];
    if (route) {
      currentRoute = route;
      twitchPageLost = true;
    }
    syncWithUrl();
  }

  Object.assign(yt, { navigateTo, syncWithUrl, stateWithRoute, forgetRouteVideo, openOnPlainClick, handlePopState });
})();
