// Channels you add yourself.

import { ConsentRequired, YT, extractJson, fetchPage, watchPageSections } from './youtube-pages.js';
import { buildLiveEntry } from './streams.js';

// Returns the channel's live entry and avatar, or null when it's not live right now.
export async function checkChannel(channelId, known) {
  const { html } = await fetchPage(`${YT}/channel/${channelId}/live`);
  const player = extractJson(html, 'ytInitialPlayerResponse = ');
  const details = player?.videoDetails;
  if (!details?.isLive || details.channelId !== channelId) return null;

  const { primary, secondary } = watchPageSections(extractJson(html, 'ytInitialData = '));
  const viewers = primary?.viewCount?.videoViewCountRenderer?.originalViewCount;
  const thumbs = secondary?.owner?.videoOwnerRenderer?.thumbnail?.thumbnails;

  const { entry } = await buildLiveEntry(
    channelId,
    [
      {
        videoId: details.videoId,
        title: details.title,
        viewers: viewers ? Number(viewers) : null,
        category: player.microformat?.microformatDataRenderer?.category ?? null,
      },
    ],
    known,
  );
  return { entry, avatar: thumbs?.at(-1)?.url ?? null };
}

// Turns anything a user might paste into a YouTube page URL we can load.
export function inputToUrl(raw) {
  const input = raw.trim();
  if (!input) return null;
  if (/^UC[\w-]{22}$/.test(input)) return `${YT}/channel/${input}`;
  if (/^@[^\s/]+$/.test(input)) return `${YT}/${input}`;
  if (/^[\w.-]+$/.test(input)) return `${YT}/@${input}`;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host === 'youtu.be') return `${YT}/watch?v=${url.pathname.slice(1)}`;
  if (host !== 'youtube.com') return null;
  return `${YT}${url.pathname}${url.search}`;
}

async function resolveChannel(input) {
  const url = inputToUrl(input);
  if (!url) throw new Error('That does not look like a YouTube channel.');

  let page;
  try {
    page = await fetchPage(url);
  } catch (e) {
    if (e instanceof ConsentRequired) throw e;
    throw new Error('Could not find that channel on YouTube.');
  }

  let id = extractJson(page.html, 'ytInitialData = ')?.metadata?.channelMetadataRenderer?.externalId;
  if (!id) {
    // A video link: use the channel that owns it.
    id = extractJson(page.html, 'ytInitialPlayerResponse = ')?.videoDetails?.channelId;
    if (!id) throw new Error('Could not find that channel on YouTube.');
    page = await fetchPage(`${YT}/channel/${id}`);
  }

  const meta = extractJson(page.html, 'ytInitialData = ')?.metadata?.channelMetadataRenderer;
  if (!meta?.externalId) throw new Error('Could not find that channel on YouTube.');
  const vanityHandle = meta.vanityChannelUrl?.match(/@[^/]+$/)?.[0];
  return {
    id: meta.externalId,
    name: meta.title,
    handle: vanityHandle ? decodeURIComponent(vanityHandle) : null,
    avatar: meta.avatar?.thumbnails?.at(-1)?.url ?? null,
  };
}

export async function addChannel(input) {
  const channel = await resolveChannel(input);
  const { channels = [], live = {} } = await chrome.storage.local.get(['channels', 'live']);
  if (channels.some((c) => c.id === channel.id)) return channel;

  const info = await checkChannel(channel.id).catch(() => null);
  const next = { ...live };
  if (info) {
    next[channel.id] = info.entry;
    if (info.avatar) channel.avatar = info.avatar;
  }
  const { channels: latest = [] } = await chrome.storage.local.get('channels');
  await chrome.storage.local.set({ channels: [...latest, channel], live: next });
  return channel;
}

export async function removeChannel(id) {
  const { channels = [], live = {}, subChannels = {} } = await chrome.storage.local.get(['channels', 'live', 'subChannels']);
  const { [id]: _removed, ...rest } = live;
  // A subscription keeps its card, and the next check works out if it's still live.
  await chrome.storage.local.set({ channels: channels.filter((c) => c.id !== id), live: subChannels[id] ? live : rest });
}
