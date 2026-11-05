// Hover tooltip, same idea as Twitch's stream-title balloon, with a still image of the stream.
// Twitch channels get theirs from features/sidebar-preview/sidebar-preview.js. A channel with
// several streams gets a list you can move onto and click to switch.
(() => {
  'use strict';

  const yt = skek.youtube;
  const { el } = skek.helpers;
  const { state, streamsOf, openStream, siteOf, compact } = yt;

  let tip = null;
  let tipTimer = null;

  function streamRow(channel, stream, preview) {
    const playing = state.openId === channel.id && openStream()?.videoId === stream.videoId;
    return el(
      'a',
      {
        class: `skek-tip__stream${playing ? ' skek-tip__stream--playing' : ''}`,
        href: siteOf(channel).streamUrl(channel, stream),
        title: stream.title,
        on: {
          click: (event) => yt.openOnPlainClick(event, channel.id, stream.videoId),
          mouseenter: () => {
            preview.src = siteOf(channel).previewUrl(stream);
          },
        },
      },
      el('span', { class: 'skek-tip__stream-title' }, stream.title),
      el(
        'span',
        { class: 'skek-tip__stream-viewers' },
        el('span', { class: 'skek-dot' }),
        el('span', {}, stream.viewers == null ? 'Live' : compact(stream.viewers)),
      ),
    );
  }

  function showTip(anchor, channel, live) {
    hideTip();
    const collapsed = !!anchor.closest('.side-nav--collapsed');
    const streams = streamsOf(live);
    const several = streams.length > 1;
    const previewUrl = siteOf(channel).previewUrl(live);
    // Kick only gives an image for channels you follow.
    const preview = previewUrl
      ? el('img', { class: 'skek-preview-img', src: previewUrl, alt: '', referrerPolicy: 'no-referrer' })
      : null;
    tip = el(
      'div',
      {
        class: `skek-tip${several ? ' skek-tip--streams' : ''}`,
        on: { mouseenter: () => clearTimeout(tipTimer), mouseleave: hideTipSoon },
      },
      collapsed ? el('div', { class: 'skek-tip__name' }, channel.name) : null,
      several
        ? el('div', { class: 'skek-tip__list' }, ...streams.map((stream) => streamRow(channel, stream, preview)))
        : el('div', { class: 'skek-tip__title' }, live.title),
      collapsed && !several
        ? el('div', { class: 'skek-tip__meta' }, `${live.category} · ${compact(live.viewers) || 'Live'}`)
        : null,
      preview,
    );
    document.body.append(tip);
    const rect = anchor.getBoundingClientRect();
    tip.style.left = `${rect.right + 8}px`;
    const top = rect.top + rect.height / 2 - tip.offsetHeight / 2;
    tip.style.top = `${Math.max(8, Math.min(top, innerHeight - tip.offsetHeight - 8))}px`;
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tip?.remove();
    tip = null;
  }

  // Long enough to cross the gap between a card and its list.
  function hideTipSoon() {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 200);
  }

  // Leave the stream list up if you're using it when the numbers refresh.
  function hideTipUnlessHovered() {
    if (!tip?.matches(':hover')) hideTip();
  }

  Object.assign(yt, { showTip, hideTip, hideTipSoon, hideTipUnlessHovered });
})();
