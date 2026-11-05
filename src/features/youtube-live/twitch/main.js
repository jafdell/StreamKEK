// Starts YouTube Live on Twitch pages. Loaded last of YouTube Live's files.
(() => {
  'use strict';

  const yt = skek.youtube;
  const { send, onBodyReady, onPageChange } = skek.helpers;
  const { state, mergeChannels } = yt;

  function init() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.channels) state.own = changes.channels.newValue ?? [];
      if (changes.subChannels) state.subs = changes.subChannels.newValue ?? {};
      if (changes.live) state.youtubeLive = changes.live.newValue ?? {};
      if (changes.kickChannels) state.kickOwn = changes.kickChannels.newValue ?? [];
      if (changes.kickFollowed) state.kickFollowed = changes.kickFollowed.newValue ?? {};
      if (changes.kickLive) state.kickLive = changes.kickLive.newValue ?? {};
      mergeChannels();
      yt.renderSidebar();
      if (state.openId && !state.channels.some((c) => c.id === state.openId)) {
        yt.navigateTo(null); // the open channel was just removed or hidden
        return;
      }
      yt.updateInfo();
      yt.syncWithUrl();
    });

    const keys = ['channels', 'subChannels', 'live', 'kickChannels', 'kickFollowed', 'kickLive', 'chatHidden'];
    chrome.storage.local.get(keys).then((saved) => {
      state.own = saved.channels ?? [];
      state.subs = saved.subChannels ?? {};
      state.youtubeLive = saved.live ?? {};
      state.kickOwn = saved.kickChannels ?? [];
      state.kickFollowed = saved.kickFollowed ?? {};
      state.kickLive = saved.kickLive ?? {};
      mergeChannels();
      state.chatHidden = !!saved.chatHidden;
      state.channelsLoaded = true;
      yt.renderSidebar(true);
      yt.syncWithUrl();
    });

    onPageChange(() => {
      yt.renderSidebar();
      yt.renderFollowing();
    });

    // This is how the stream view notices Twitch's own navigation, like clicking a Twitch channel,
    // so it isn't wasted work.
    setInterval(yt.syncWithUrl, 300);
    addEventListener('popstate', yt.handlePopState);
    addEventListener('resize', yt.placeView);

    send({ type: 'youtube-live:refresh' });
    send({ type: 'kick-live:refresh' });
  }

  // Runs at document_start to read the /yt/ or /kick/ address before Twitch shortens it.
  onBodyReady(init);
})();
