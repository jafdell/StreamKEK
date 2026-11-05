// Works out what's live and saves it. The `live` key in chrome.storage.local is:
//   { [channelId]: { ...most watched stream, streams: [every live stream] } }
//   where a stream is { videoId, title, category, viewers, startedAt }
// The other keys are in CONTRIBUTING.md.

import { ConsentRequired, forEachLimited } from './youtube-pages.js';
import { buildLiveEntry, carryStreamDetails } from './streams.js';
import { checkChannel } from './channels.js';
import { fetchLiveSubscriptions } from './subscriptions.js';

let polling = null;

export function poll() {
  polling ??= runPoll().finally(() => {
    polling = null;
  });
  return polling;
}

async function checkOwnChannels(channels, previous) {
  const result = { live: {}, avatars: {}, consentRequired: false };
  await forEachLimited(channels, async (channel) => {
    try {
      const info = await checkChannel(channel.id, previous[channel.id]);
      if (info) {
        result.live[channel.id] = info.entry;
        if (info.avatar) result.avatars[channel.id] = info.avatar;
      }
    } catch (e) {
      if (e instanceof ConsentRequired) result.consentRequired = true;
      // A failed check says nothing about the stream, so keep what we knew.
      if (previous[channel.id]) result.live[channel.id] = previous[channel.id];
    }
  });
  return result;
}

// Adds live subscriptions to `live`. A channel you added yourself is already there.
async function checkSubscriptions(live, previous, previousSubs) {
  const result = { subChannels: { ...previousSubs }, signedOut: false, consentRequired: false };
  try {
    const feed = await fetchLiveSubscriptions();
    result.signedOut = feed.signedOut;
    await forEachLimited(feed.channels, async ({ channel, found }) => {
      let details = {};
      if (!live[channel.id]) {
        const built = await buildLiveEntry(channel.id, found, previous[channel.id]);
        live[channel.id] = built.entry;
        details = built.details;
      }
      result.subChannels[channel.id] = {
        ...channel,
        avatar: channel.avatar ?? details.avatar ?? previousSubs[channel.id]?.avatar ?? null,
        handle: channel.handle ?? details.handle ?? previousSubs[channel.id]?.handle ?? null,
      };
    });
  } catch (e) {
    if (e instanceof ConsentRequired) result.consentRequired = true;
    // A failed feed says nothing about those streams, so keep what we knew.
    for (const id of Object.keys(previousSubs)) if (previous[id]) live[id] ??= previous[id];
  }
  return result;
}

async function runPoll() {
  const {
    channels = [],
    live: previous = {},
    subChannels: previousSubs = {},
    showSubscriptions = true,
  } = await chrome.storage.local.get(['channels', 'live', 'subChannels', 'showSubscriptions']);

  const own = await checkOwnChannels(channels, previous);
  const { live } = own;
  const subs = showSubscriptions
    ? await checkSubscriptions(live, previous, previousSubs)
    : { subChannels: previousSubs, signedOut: false, consentRequired: false };

  // Re-read: things may have changed while we were fetching.
  const { channels: current = [], showSubscriptions: stillShowing = true, live: latest = {} } =
    await chrome.storage.local.get(['channels', 'showSubscriptions', 'live']);
  const ids = new Set(current.map((c) => c.id));
  if (stillShowing) for (const id of Object.keys(subs.subChannels)) ids.add(id);
  for (const id of Object.keys(live)) if (!ids.has(id)) delete live[id];
  for (const c of current) if (!channels.some((o) => o.id === c.id) && latest[c.id]) live[c.id] = latest[c.id];
  carryStreamDetails(live, latest);

  await chrome.storage.local.set({
    live,
    channels: current.map((c) => (own.avatars[c.id] ? { ...c, avatar: own.avatars[c.id] } : c)),
    subChannels: stillShowing ? subs.subChannels : {},
    status: {
      checkedAt: Date.now(),
      consentRequired: own.consentRequired || subs.consentRequired,
      signedOut: subs.signedOut,
    },
  });
}

export async function pollIfTwitchOpen() {
  const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
  if (tabs.length) await poll();
}

export async function setShowSubscriptions(enabled) {
  await chrome.storage.local.set({ showSubscriptions: enabled });
  if (enabled) return poll();
  const { channels = [], live = {} } = await chrome.storage.local.get(['channels', 'live']);
  const kept = Object.fromEntries(channels.filter((c) => live[c.id]).map((c) => [c.id, live[c.id]]));
  await chrome.storage.local.set({ subChannels: {}, live: kept });
}
