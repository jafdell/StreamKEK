// Works out what's live and saves it. The `live` key in chrome.storage.local is:
//   { [channelId]: { ...most watched stream, streams: [every live stream] } }
//   where a stream is { videoId, title, category, viewers, startedAt }
// The other keys are in CONTRIBUTING.md.

import { forEachLimited } from '../../streams/background/for-each-limited.js';
import { ConsentRequired } from './youtube-pages.js';
import { carryStreamDetails } from './streams.js';
import { checkChannel } from './channels.js';
import { fetchLiveSubscriptions } from './subscriptions.js';

let polling = null;

export function poll() {
  polling ??= runPoll().finally(() => {
    polling = null;
  });
  return polling;
}

async function checkChannels(channels, previous) {
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
async function checkSubscriptions(live, previous, previousSubs, hidden) {
  const result = { subChannels: { ...previousSubs }, signedOut: false, consentRequired: false };
  try {
    const subs = await fetchLiveSubscriptions();
    result.signedOut = subs.signedOut;
    const shown = subs.channels.filter((c) => !hidden[c.id]);
    const checked = await checkChannels(shown.filter((c) => !live[c.id]), previous);
    Object.assign(live, checked.live);
    result.consentRequired = checked.consentRequired;
    for (const channel of shown) {
      if (!live[channel.id]) continue;
      result.subChannels[channel.id] = {
        ...channel,
        avatar: channel.avatar ?? checked.avatars[channel.id] ?? previousSubs[channel.id]?.avatar ?? null,
        handle: channel.handle ?? previousSubs[channel.id]?.handle ?? null,
      };
    }
  } catch (e) {
    if (e instanceof ConsentRequired) result.consentRequired = true;
    else console.warn('StreamKEK: could not read your live subscriptions', e);
    // A failed check says nothing about those streams, so keep what we knew.
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
    hiddenChannels = {},
  } = await chrome.storage.local.get(['channels', 'live', 'subChannels', 'showSubscriptions', 'hiddenChannels']);

  const own = await checkChannels(channels, previous);
  const { live } = own;
  const subs = showSubscriptions
    ? await checkSubscriptions(live, previous, previousSubs, hiddenChannels)
    : { subChannels: previousSubs, signedOut: false, consentRequired: false };

  // Re-read: things may have changed while we were fetching.
  const {
    channels: current = [],
    showSubscriptions: stillShowing = true,
    live: latest = {},
    hiddenChannels: stillHidden = {},
  } = await chrome.storage.local.get(['channels', 'showSubscriptions', 'live', 'hiddenChannels']);
  for (const id of Object.keys(stillHidden)) delete subs.subChannels[id];
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

// A hidden subscription isn't checked or listed until you show it again. A channel you
// added yourself can't be hidden: you remove it instead.
export async function hideChannel(id) {
  const { channels = [], subChannels = {}, live = {}, hiddenChannels = {} } = await chrome.storage.local.get([
    'channels',
    'subChannels',
    'live',
    'hiddenChannels',
  ]);
  const channel = subChannels[id];
  if (!channel || channels.some((c) => c.id === id)) return;
  const { [id]: _sub, ...otherSubs } = subChannels;
  const { [id]: _live, ...otherLive } = live;
  await chrome.storage.local.set({
    subChannels: otherSubs,
    live: otherLive,
    hiddenChannels: { ...hiddenChannels, [id]: channel },
  });
}

export async function unhideChannel(id) {
  const { hiddenChannels = {} } = await chrome.storage.local.get('hiddenChannels');
  const { [id]: _hidden, ...otherHidden } = hiddenChannels;
  await chrome.storage.local.set({ hiddenChannels: otherHidden });
  // A poll that's already running would still skip this channel, so run a fresh one.
  await polling?.catch(() => {});
  return poll();
}
