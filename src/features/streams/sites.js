// Everything the shared code needs to know about each site it brings to Twitch, in the order they
// appear. A new site needs an entry here, its own background/ and frames/ folders like
// features/kick/, a settings category, and its host and scripts in manifest.json. Loaded on Twitch
// pages and in the settings window and channel manager, so it can't use skek.helpers.
(() => {
  'use strict';

  const SITES = {
    youtube: {
      name: 'YouTube',
      domain: 'youtube.com',
      // Addresses on Twitch are /<routePrefix>/<channel>, plus routeTail if there's more to them:
      // here, the video id of a stream you picked from a channel's list.
      routePrefix: 'yt',
      routeTail: '(?:/[\\w-]{11})?',
      messagePrefix: 'youtube-live',
      // The storage keys. Never rename these: nothing migrates old keys.
      keys: { own: 'channels', followed: 'subChannels', live: 'live', status: 'status', hidden: 'hiddenChannels' },
      followsSetting: 'showSubscriptions',
      placeholder: '@handle or channel link',
      managerHint: 'Add or remove channels by @handle, channel link or video link.',
      // The /watch page only says when a stream started and what it's playing if asked separately.
      loadsDetails: true,
      section: { id: 'skek-section', title: 'YouTube Live', glyph: 'youtube' },
      following: {
        path: '/directory/following/youtube',
        tabId: 'skek-following-tab',
        panelId: 'skek-youtube-tab',
        sectionId: 'skek-inline-section',
        sectionTitle: 'YouTube live',
      },
      channelUrl: (channel) => `https://www.youtube.com/channel/${channel.id}`,
      streamUrl: (channel, stream) => `https://www.youtube.com/watch?v=${stream.videoId}`,
      previewUrl: (stream) => `https://i.ytimg.com/vi/${encodeURIComponent(stream.videoId)}/hqdefault_live.jpg`,
      // `settings` goes on the chat's address, for its frame script to read.
      frameUrls(channel, stream, settings) {
        const id = encodeURIComponent(stream.videoId);
        return {
          // The watch page offers every quality; the embedded player often stops at 1080p.
          player: `https://www.youtube.com/watch?v=${id}`,
          chat: `https://www.youtube.com/live_chat?v=${id}&embed_domain=${location.hostname}${settings}`,
        };
      },
    },
    kick: {
      name: 'Kick',
      domain: 'kick.com',
      routePrefix: 'kick',
      messagePrefix: 'kick-live',
      keys: { own: 'kickChannels', followed: 'kickFollowed', live: 'kickLive', status: 'kickStatus', hidden: 'kickHidden' },
      followsSetting: 'showKickFollows',
      placeholder: 'Channel name or link',
      managerHint: 'Add or remove channels by name or channel link.',
      // In the sidebar's + button, which covers every site, this says a link belongs to this site.
      linkPattern: /^(https?:\/\/)?([\w-]+\.)?kick\.com\//i,
      section: { id: 'skek-kick-section', title: 'Kick Live', glyph: 'kick' },
      following: {
        path: '/directory/following/kick',
        tabId: 'skek-following-kick-tab',
        panelId: 'skek-kick-tab',
        sectionId: 'skek-kick-inline-section',
        sectionTitle: 'Kick live',
      },
      channelUrl: (channel) => `https://kick.com/${channel.slug}`,
      streamUrl: (channel) => `https://kick.com/${channel.slug}`,
      // Kick only gives an image for channels you follow.
      previewUrl: (stream) => stream.thumbnail ?? '',
      frameUrls(channel, stream, settings) {
        const slug = encodeURIComponent(channel.slug);
        return {
          // The channel page offers every quality; the embed player, player.kick.com, stops at a low one.
          player: `https://kick.com/${slug}`,
          chat: `https://kick.com/popout/${slug}/chat${settings}`,
        };
      },
    },
  };

  // YouTube's channels were saved before there were other sites, so they don't say.
  const platformOf = (channel) => channel?.platform ?? 'youtube';

  Object.assign(skek, { sites: SITES, platformOf, siteOf: (channel) => SITES[platformOf(channel)] });
})();
