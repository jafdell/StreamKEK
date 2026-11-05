// A channel can run several live streams at once. Its entry in `live` holds the most
// watched one at the top level, and all of them (including that one) in `streams`.

import { YT, extractJson, fetchPage, streamDetails } from './youtube-pages.js';

export function viewerCount(text) {
  const match = text?.match(/^(\d(?:[\d\s.,]*\d)?)\s*(k|m|tn|mn)?(?:\s|$)/i);
  if (!match) return null;
  if (!match[2]) return Number(match[1].replace(/\D/g, ''));
  const scale = /^m/i.test(match[2]) ? 1e6 : 1e3;
  return Math.round(Number(match[1].trim().replace(',', '.')) * scale);
}

export function collectVideoItems(node, found = []) {
  if (Array.isArray(node)) node.forEach((x) => collectVideoItems(x, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'lockupViewModel') found.push(value);
      else collectVideoItems(value, found);
    }
  }
  return found;
}

export function isLiveItem(item) {
  return JSON.stringify(item.contentImage ?? {}).includes('THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE');
}

export function itemMetadataParts(item) {
  const rows = item.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  return rows.flatMap((row) => row.metadataParts ?? []);
}

// Every live stream on a channel's Live tab. They're listed before its past streams.
async function fetchChannelStreams(channelId) {
  const { html } = await fetchPage(`${YT}/channel/${channelId}/streams`);
  return collectVideoItems(extractJson(html, 'ytInitialData = '))
    .filter((item) => isLiveItem(item) && item.contentId)
    .map((item) => ({
      videoId: item.contentId,
      title: item.metadata?.lockupMetadataViewModel?.title?.content ?? '',
      viewers: viewerCount(itemMetadataParts(item)[0]?.text?.content),
    }));
}

function knownStreams(entry) {
  return entry?.streams ?? (entry ? [entry] : []);
}

function withoutNulls(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value != null));
}

// `found` is what's already known to be live. Details are only fetched for the top
// stream here; the others are fetched if you open them (see loadStreamDetails).
export async function buildLiveEntry(channelId, found, known) {
  const previous = knownStreams(known);
  const listed = await fetchChannelStreams(channelId).catch(() => previous);

  const byVideo = new Map();
  for (const stream of [...found, ...listed]) {
    byVideo.set(stream.videoId, { ...byVideo.get(stream.videoId), ...withoutNulls(stream) });
  }
  const streams = [...byVideo.values()]
    .map(({ streams: _nested, ...stream }) => {
      const before = previous.find((s) => s.videoId === stream.videoId);
      return {
        category: before?.category ?? null,
        startedAt: before?.startedAt ?? null,
        viewers: null,
        ...stream,
      };
    })
    .sort((a, b) => (b.viewers ?? -1) - (a.viewers ?? -1));

  const top = streams[0];
  let details = {};
  if (!top.startedAt) {
    details = await streamDetails(top.videoId).catch(() => ({}));
    if (details.startedAt) top.startedAt = details.startedAt;
    if (details.category) top.category = details.category;
  }
  top.category ||= 'YouTube';

  return { entry: { ...top, streams }, details };
}

// Polls overwrite `live`, so keep details fetched while a poll was running.
export function carryStreamDetails(live, latest) {
  for (const [channelId, entry] of Object.entries(live)) {
    const newer = knownStreams(latest[channelId]);
    for (const stream of entry.streams ?? []) {
      const match = newer.find((s) => s.videoId === stream.videoId);
      if (match?.startedAt && !stream.startedAt) {
        stream.startedAt = match.startedAt;
        stream.category = match.category;
      }
    }
  }
}

// Called when you open a stream that isn't the channel's top one.
export async function loadStreamDetails(channelId, videoId) {
  const details = await streamDetails(videoId);
  const { live = {} } = await chrome.storage.local.get('live');
  const stream = live[channelId]?.streams?.find((s) => s.videoId === videoId);
  if (!stream) return;
  stream.startedAt = details.startedAt;
  stream.category = details.category ?? stream.category;
  await chrome.storage.local.set({ live });
}
