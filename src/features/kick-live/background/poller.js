// Works out what's live on Kick and saves it. `kickLive` has the same shape as YouTube's `live`.
// The other keys are in CONTRIBUTING.md.

import { forEachLimited } from '../../youtube-live/background/youtube-pages.js';
import { fetchChannel, fetchFollowedLive, slugFromInput } from './kick-api.js';

let polling = null;

export function poll() {
  polling ??= runPoll().finally(() => {
    polling = null;
  });
  return polling;
}

async function checkOwnChannels(channels, previous) {
  const result = { live: {}, avatars: {} };
  await forEachLimited(channels, async (channel) => {
    try {
      const found = await fetchChannel(channel.slug);
      if (found?.entry) result.live[channel.id] = found.entry;
      if (found?.channel.avatar) result.avatars[channel.id] = found.channel.avatar;
    } catch (e) {
      console.warn(`StreamKEK: could not check ${channel.slug} on Kick`, e);
      // A failed check says nothing about the stream, so keep what we knew.
      if (previous[channel.id]) result.live[channel.id] = previous[channel.id];
    }
  });
  return result;
}

// Adds live followed channels to `live`. A channel you added yourself gets its newer details.
async function checkFollowed(live, previous, previousFollowed, hidden) {
  const result = { followed: { ...previousFollowed }, signedOut: false, failed: false };
  try {
    const { signedOut, channels } = await fetchFollowedLive();
    result.signedOut = signedOut;
    for (const { channel, entry } of channels) {
      if (hidden[channel.id]) continue;
      live[channel.id] = entry;
      result.followed[channel.id] = channel;
    }
  } catch (e) {
    console.warn('StreamKEK: could not read who you follow on Kick', e);
    result.failed = true;
    for (const id of Object.keys(previousFollowed)) if (previous[id]) live[id] ??= previous[id];
  }
  return result;
}

async function runPoll() {
  const {
    kickChannels = [],
    kickLive: previous = {},
    kickFollowed: previousFollowed = {},
    kickHidden = {},
    showKickFollows = true,
  } = await chrome.storage.local.get(['kickChannels', 'kickLive', 'kickFollowed', 'kickHidden', 'showKickFollows']);

  const own = await checkOwnChannels(kickChannels, previous);
  const { live } = own;
  const { followed, signedOut, failed } = showKickFollows
    ? await checkFollowed(live, previous, previousFollowed, kickHidden)
    : { followed: previousFollowed, signedOut: false, failed: false };

  // Re-read: things may have changed while we were fetching.
  const {
    kickChannels: current = [],
    kickHidden: stillHidden = {},
    showKickFollows: stillShowing = true,
    kickLive: latest = {},
  } = await chrome.storage.local.get(['kickChannels', 'kickHidden', 'showKickFollows', 'kickLive']);
  for (const id of Object.keys(stillHidden)) delete followed[id];
  const ids = new Set(current.map((c) => c.id));
  if (stillShowing) for (const id of Object.keys(followed)) ids.add(id);
  for (const id of Object.keys(live)) if (!ids.has(id)) delete live[id];
  for (const c of current) if (!kickChannels.some((o) => o.id === c.id) && latest[c.id]) live[c.id] = latest[c.id];

  await chrome.storage.local.set({
    kickLive: live,
    kickChannels: current.map((c) => (own.avatars[c.id] ? { ...c, avatar: own.avatars[c.id] } : c)),
    kickFollowed: stillShowing ? followed : {},
    kickStatus: { checkedAt: Date.now(), signedOut, failed },
  });
}

export async function pollIfTwitchOpen() {
  const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
  if (tabs.length) await poll();
}

export async function setShowFollows(enabled) {
  await chrome.storage.local.set({ showKickFollows: enabled });
  if (enabled) return poll();
  const { kickChannels = [], kickLive = {} } = await chrome.storage.local.get(['kickChannels', 'kickLive']);
  const kept = Object.fromEntries(kickChannels.filter((c) => kickLive[c.id]).map((c) => [c.id, kickLive[c.id]]));
  await chrome.storage.local.set({ kickFollowed: {}, kickLive: kept });
}

export async function addChannel(input) {
  const slug = slugFromInput(input);
  if (!slug) throw new Error('That does not look like a Kick channel.');
  const found = await fetchChannel(slug).catch(() => {
    throw new Error('Could not reach Kick. Try again in a moment.');
  });
  if (!found) throw new Error('Could not find that channel on Kick.');

  const { kickChannels = [], kickLive = {}, kickHidden = {} } = await chrome.storage.local.get([
    'kickChannels',
    'kickLive',
    'kickHidden',
  ]);
  const { channel, entry } = found;
  if (kickChannels.some((c) => c.id === channel.id)) return channel;
  // Adding a channel you'd hidden means you want to see it again.
  const { [channel.id]: _hidden, ...otherHidden } = kickHidden;
  await chrome.storage.local.set({
    kickChannels: [...kickChannels, channel],
    kickLive: entry ? { ...kickLive, [channel.id]: entry } : kickLive,
    kickHidden: otherHidden,
  });
  return channel;
}

export async function removeChannel(id) {
  const { kickChannels = [], kickLive = {}, kickFollowed = {} } = await chrome.storage.local.get([
    'kickChannels',
    'kickLive',
    'kickFollowed',
  ]);
  const { [id]: _removed, ...rest } = kickLive;
  // A followed channel keeps its card, and the next check works out if it's still live.
  await chrome.storage.local.set({
    kickChannels: kickChannels.filter((c) => c.id !== id),
    kickLive: kickFollowed[id] ? kickLive : rest,
  });
}

// A hidden followed channel isn't listed until you show it again. A channel you added
// yourself can't be hidden: you remove it instead.
export async function hideChannel(id) {
  const { kickChannels = [], kickFollowed = {}, kickLive = {}, kickHidden = {} } = await chrome.storage.local.get([
    'kickChannels',
    'kickFollowed',
    'kickLive',
    'kickHidden',
  ]);
  const channel = kickFollowed[id];
  if (!channel || kickChannels.some((c) => c.id === id)) return;
  const { [id]: _followed, ...otherFollowed } = kickFollowed;
  const { [id]: _live, ...otherLive } = kickLive;
  await chrome.storage.local.set({
    kickFollowed: otherFollowed,
    kickLive: otherLive,
    kickHidden: { ...kickHidden, [id]: channel },
  });
}

export async function unhideChannel(id) {
  const { kickHidden = {} } = await chrome.storage.local.get('kickHidden');
  const { [id]: _hidden, ...otherHidden } = kickHidden;
  await chrome.storage.local.set({ kickHidden: otherHidden });
  // A poll that's already running would still skip this channel, so run a fresh one.
  await polling?.catch(() => {});
  return poll();
}
