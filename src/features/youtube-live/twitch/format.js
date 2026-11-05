// Formatting helpers for YouTube Live cards.
(() => {
  'use strict';

  const { el } = skek.helpers;

  function avatarImg(channel, className) {
    return el('img', { class: className, src: channel.avatar || '', alt: '', referrerPolicy: 'no-referrer' });
  }

  function thumbnailUrl(videoId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault_live.jpg`;
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

  Object.assign(skek.youtube, { avatarImg, thumbnailUrl, compact, uptime });
})();
