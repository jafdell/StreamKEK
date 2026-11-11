// Works out what's live on Kick and saves it. `kickLive` has the same shape as YouTube's `live`.
// The other keys are in CONTRIBUTING.md.

import { forEachLimited } from '../../streams/background/for-each-limited.js';
import { createSiteBackground } from '../../streams/background/site-background.js';
import { fetchChannel, fetchFollowedLive } from './kick-api.js';

export const KEYS = { own: 'kickChannels', followed: 'kickFollowed', live: 'kickLive', status: 'kickStatus', hidden: 'kickHidden' };

export const background = createSiteBackground({ platform: 'kick', keys: KEYS, followsSetting: 'showKickFollows', runPoll });

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
