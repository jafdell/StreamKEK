// Channels you add yourself.

import { fetchChannel, slugFromInput } from './kick-api.js';

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
