// What the Twitch page knows. Kept in sync with chrome.storage by main.js. Every site shares this
// page's code: what differs between them is in ../sites.js.
(() => {
  'use strict';

  const { sites, platformOf, siteOf } = skek;

  // bySite = what's saved for each site: channels you added, followed channels seen live, live streams.
  // channels = yours plus followed channels seen live, on every site; offline ones are only listed if yours.
  // live = every site's live streams.
  // routeVideoId = the stream named in the address, if any.
  // pinnedVideoId = what's playing, so it doesn't change when viewer counts shift.
  // view = the open stream view: its elements, its stream and its layout. See stream-view.js.
  // favorites = the saved copy of each favorite channel, from any site including Twitch, in your order.
  // multi = the open multi-stream view: its elements and its streams. See multi-view.js.
  const state = {
    bySite: Object.fromEntries(Object.keys(sites).map((platform) => [platform, { own: [], followed: {}, live: {} }])),
    favorites: [],
    multi: null,
    channels: [],
    live: {},
    openId: null,
    routeVideoId: null,
    pinnedVideoId: null,
    view: null,
    chatHidden: false,
    channelsLoaded: false,
  };

  function mergeChannels() {
    const all = Object.values(state.bySite);
    const ownIds = new Set(all.flatMap(({ own }) => own.map((c) => c.id)));
    state.channels = all.flatMap(({ own, followed }) => [...own, ...Object.values(followed).filter((c) => !ownIds.has(c.id))]);
    state.live = Object.assign({}, ...all.map(({ live }) => live));
  }

  function channelsOn(platform) {
    return state.channels.filter((c) => platformOf(c) === platform);
  }

  function liveChannels(platform) {
    return channelsOn(platform)
      .filter((c) => state.live[c.id])
      .sort((a, b) => (state.live[b.id].viewers ?? 0) - (state.live[a.id].viewers ?? 0));
  }

  function streamsOf(live) {
    return live?.streams ?? (live ? [live] : []);
  }

  // The stream to show for the open channel: the one asked for, else the most watched.
  function openStream() {
    const streams = streamsOf(state.live[state.openId]);
    const wanted = state.routeVideoId ?? state.pinnedVideoId;
    return streams.find((s) => s.videoId === wanted) ?? streams[0] ?? null;
  }

  // Every channel playing in this tab's stream view or multi-stream view.
  function openIds() {
    if (state.multi) return state.multi.entries.map((entry) => entry.id);
    return state.openId ? [state.openId] : [];
  }

  skek.streams = { state, sites, platformOf, siteOf, mergeChannels, channelsOn, liveChannels, streamsOf, openStream, openIds };
})();
