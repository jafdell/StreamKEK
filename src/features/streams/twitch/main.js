// Starts the streams from other sites on Twitch pages. Loaded last of these files.
(() => {
  'use strict';

  const shared = skek.streams;
  const { send, onBodyReady, onPageChange } = skek.helpers;
  const { state, sites, mergeChannels } = shared;

  const siteEntries = Object.entries(sites);

  function init() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const [platform, { keys }] of siteEntries) {
        const site = state.bySite[platform];
        if (changes[keys.own]) site.own = changes[keys.own].newValue ?? [];
        if (changes[keys.followed]) site.followed = changes[keys.followed].newValue ?? {};
        if (changes[keys.live]) site.live = changes[keys.live].newValue ?? {};
      }
      if (changes.favoriteChannels) {
        state.favorites = changes.favoriteChannels.newValue ?? [];
        shared.refreshTwitchStatus();
      }
      mergeChannels();
      shared.renderSidebar();
      if (state.openId && !state.channels.some((c) => c.id === state.openId)) {
        shared.navigateTo(null); // the open channel was just removed or hidden
        return;
      }
      shared.updateInfo();
      shared.updateMulti();
      shared.syncWithUrl();
    });

    const keys = siteEntries.flatMap(([, { keys: k }]) => [k.own, k.followed, k.live]);
    chrome.storage.local.get([...keys, 'chatHidden', 'favoriteChannels']).then((saved) => {
      for (const [platform, { keys: k }] of siteEntries) {
        state.bySite[platform] = { own: saved[k.own] ?? [], followed: saved[k.followed] ?? {}, live: saved[k.live] ?? {} };
      }
      mergeChannels();
      state.chatHidden = !!saved.chatHidden;
      state.favorites = saved.favoriteChannels ?? [];
      state.channelsLoaded = true;
      shared.renderSidebar(true);
      shared.syncWithUrl();
      shared.refreshTwitchStatus();
    });

    onPageChange(() => {
      shared.renderSidebar();
      shared.renderFollowing();
    });

    // This is how the stream view notices Twitch's own navigation, like clicking a Twitch channel,
    // so it isn't wasted work.
    setInterval(shared.syncWithUrl, 300);
    addEventListener('popstate', shared.handlePopState);
    addEventListener('resize', shared.placeView);
    addEventListener('resize', shared.placeMulti);

    for (const [, { messagePrefix }] of siteEntries) send({ type: `${messagePrefix}:refresh` });
  }

  // Runs at document_start to read the /yt/ or /kick/ address before Twitch shortens it.
  onBodyReady(init);
})();
