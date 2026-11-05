// Formatting helpers for YouTube Live and Kick Live cards.
(() => {
  'use strict';

  const { el } = skek.helpers;
  const { platformOf } = skek.youtube;

  function avatarImg(channel, className) {
    return el('img', { class: className, src: channel.avatar || '', alt: '', referrerPolicy: 'no-referrer' });
  }

  function thumbnailUrl(videoId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault_live.jpg`;
  }

  // What differs between the two sites when linking to a channel or showing its stream.
  const SITES = {
    youtube: {
      name: 'YouTube',
      routePrefix: 'yt',
      channelUrl: (channel) => `https://www.youtube.com/channel/${channel.id}`,
      streamUrl: (channel, stream) => `https://www.youtube.com/watch?v=${stream.videoId}`,
      previewUrl: (stream) => thumbnailUrl(stream.videoId),
    },
    kick: {
      name: 'Kick',
      routePrefix: 'kick',
      channelUrl: (channel) => `https://kick.com/${channel.slug}`,
      streamUrl: (channel) => `https://kick.com/${channel.slug}`,
      previewUrl: (stream) => stream.thumbnail ?? '',
    },
  };

  function siteOf(channel) {
    return SITES[platformOf(channel)];
  }

  function compact(n) {
    if (n == null) return '';
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }

  function uptime(startedAt) {
    if (!startedAt) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt)) / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  }

  Object.assign(skek.youtube, { avatarImg, thumbnailUrl, siteOf, compact, uptime });
})();
