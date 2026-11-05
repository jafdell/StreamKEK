// What the Twitch page knows. Kept in sync with chrome.storage by main.js.
(() => {
  'use strict';

  // channels = yours plus subscriptions seen live; offline ones are only listed if yours.
  // routeVideoId = the stream named in the address, if any.
  // pinnedVideoId = what's playing, so it doesn't change when viewer counts shift.
  const state = {
    channels: [],
    own: [],
    subs: {},
    live: {},
    openId: null,
    routeVideoId: null,
    pinnedVideoId: null,
    chatHidden: false,
    channelsLoaded: false,
  };

  function mergeChannels() {
    const ownIds = new Set(state.own.map((c) => c.id));
    state.channels = [...state.own, ...Object.values(state.subs).filter((c) => !ownIds.has(c.id))];
  }

  function liveChannels() {
    return state.channels
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

  skek.youtube = { state, mergeChannels, liveChannels, streamsOf, openStream };
})();
