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
      mergeChannels();
      if (changes.live) state.live = changes.live.newValue ?? {};
      yt.renderSidebar();
      if (state.openId && !state.channels.some((c) => c.id === state.openId)) {
        yt.navigateTo(null); // the open channel was just removed or hidden
        return;
      }
      yt.updateInfo();
      yt.syncWithUrl();
    });

    chrome.storage.local.get(['channels', 'subChannels', 'live', 'chatHidden']).then((saved) => {
      state.own = saved.channels ?? [];
      state.subs = saved.subChannels ?? {};
      mergeChannels();
      state.live = saved.live ?? {};
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
  }

  // Runs at document_start to read the /yt/ address before Twitch shortens it.
  onBodyReady(init);
})();
