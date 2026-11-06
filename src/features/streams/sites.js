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
      placeholder: 'YouTube @handle or link',
      managerHint: 'Add a channel by @handle, channel link or video link.',
      // Says a link belongs to this site, so one pasted under another site can be sent here.
      linkPattern: /^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be)\//i,
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
      placeholder: 'Kick channel name or link',
      managerHint: 'Add a channel by name or channel link.',
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

  // Not one of SITES, since it needs no stream view or service worker: this is only what a favorite's
  // card and the multi-stream view need when a channel is on Twitch. Those are in streams/twitch/.
  const TWITCH = {
    name: 'Twitch',
    streamUrl: (channel) => `https://www.twitch.tv/${channel.login}`,
    channelUrl: (channel) => `https://www.twitch.tv/${channel.login}`,
    previewUrl: (stream) => stream.thumbnail ?? '',
    frameUrls(channel, stream, settings) {
      const parent = `parent=${location.hostname}`;
      const theme = settings.includes('skek-theme=dark') ? '&darkpopout' : '';
      return {
        player: `https://player.twitch.tv/?channel=${channel.login}&${parent}`,
        chat: `https://www.twitch.tv/embed/${channel.login}/chat?${parent}${theme}${settings}`,
      };
    },
  };

  // YouTube's channels were saved before there were other sites, so they don't say.
  const platformOf = (channel) => channel?.platform ?? 'youtube';

  const siteOf = (channel) => (platformOf(channel) === 'twitch' ? TWITCH : SITES[platformOf(channel)]);

  Object.assign(skek, { sites: SITES, platformOf, siteOf });
})();
