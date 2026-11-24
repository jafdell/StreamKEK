// Formatting helpers for the cards of streams from other sites.
(() => {
  'use strict';

  const { el } = skek.helpers;

  function avatarImg(channel, className) {
    return el('img', { class: className, src: channel.avatar || '', alt: '', referrerPolicy: 'no-referrer' });
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

  // Splits text at the web addresses in it, so they can be made into links: [{ text, url }], with
  // `url` only on an address. A full stop or a bracket right after an address isn't part of it.
  function linkParts(text) {
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const address = match[0].replace(/[.,;:!?)\]]+$/, '');
      let url;
      try {
        url = new URL(address).href;
      } catch {
        continue;
      }
      if (match.index > last) parts.push({ text: text.slice(last, match.index) });
      parts.push({ text: address, url });
      last = match.index + address.length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
  }

  Object.assign(skek.streams, { avatarImg, compact, uptime, linkParts });
})();
