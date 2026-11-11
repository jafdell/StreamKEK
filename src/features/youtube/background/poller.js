// Works out what's live and saves it. The `live` key in chrome.storage.local is:
//   { [channelId]: { ...most watched stream, streams: [every live stream] } }
//   where a stream is { videoId, title, category, viewers, startedAt }
// The other keys are in CONTRIBUTING.md.

import { forEachLimited } from '../../streams/background/for-each-limited.js';
import { createSiteBackground } from '../../streams/background/site-background.js';
import { ConsentRequired } from './youtube-pages.js';
import { carryStreamDetails } from './live-entry.js';
import { checkChannel } from './channels.js';
import { fetchLiveSubscriptions } from './subscriptions.js';

export const KEYS = { own: 'channels', followed: 'subChannels', live: 'live', status: 'status', hidden: 'hiddenChannels' };

export const background = createSiteBackground({ platform: 'youtube', keys: KEYS, followsSetting: 'showSubscriptions', runPoll });

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
