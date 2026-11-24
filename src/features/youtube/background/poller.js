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

// YouTube's list of your subscriptions says every minute which of them are live. A live one's own
// pages only add its title, viewers and streams, and are several MB each time, so they're read when
// it goes live and then about every five minutes. A little under five, so the fifth check reads them.
// A channel you added is on no such list, so its live page is read at every check: that's what says
// within a minute that it went live or ended, with its stream's title and viewers. Its list of
// streams only adds the other streams it's running, so that one waits the same way.
const PAGES_MS = 4.5 * 60_000;
// When each live subscription's pages, and each live added channel's list of streams, were last
// read: { [channelId]: time }. In session storage, as the worker can stop between checks. Empty after
// a browser restart, so everything is read once then.
const PAGES_READ_KEY = 'youtubePagesRead';

// Whether a channel that was already live at the last check had those read not long ago.
function readLately(channel, previous, readAt, now) {
  return !!previous[channel.id] && now - readAt[channel.id] < PAGES_MS;
}

// The live subscriptions whose pages need reading now: those that weren't live at the last check,
// and those whose pages were read a while ago.
export function subscriptionsToRead(channels, previous, readAt, now) {
  return channels.filter((channel) => !readLately(channel, previous, readAt, now));
}

// `read` is the channels YouTube answered for, live or not. `listReadLately` says whose list of
// streams can be left unread this time.
async function checkChannels(channels, previous, listReadLately = () => false) {
  const result = { live: {}, avatars: {}, read: [], consentRequired: false };
  await forEachLimited(channels, async (channel) => {
    try {
      const info = await checkChannel(channel.id, previous[channel.id], listReadLately(channel));
      result.read.push(channel.id);
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

// Adds live subscriptions to `live`. A channel you added yourself is already there, and runPoll
// remembers when its list was read: `ownIds` keeps those out of `pagesRead`, which is when each live
// subscription's pages were last read, or null when YouTube's list of them couldn't be read.
async function checkSubscriptions(live, previous, previousSubs, hidden, ownIds, readAt, now) {
  const result = { subChannels: { ...previousSubs }, pagesRead: null, signedOut: false, consentRequired: false };
  try {
    const subs = await fetchLiveSubscriptions();
    result.signedOut = subs.signedOut;
    const shown = subs.channels.filter((c) => !hidden[c.id]);
    const waiting = shown.filter((c) => !live[c.id]);
    const toRead = subscriptionsToRead(waiting, previous, readAt, now);
    // Still live by YouTube's list, and read not long ago, so what was known then stands.
    for (const c of waiting) if (!toRead.includes(c)) live[c.id] = previous[c.id];
    const checked = await checkChannels(toRead, previous);
    Object.assign(live, checked.live);
    result.consentRequired = checked.consentRequired;
    // Only the subscriptions live now, so this never grows.
    const times = shown
      .filter((c) => !ownIds.has(c.id))
      .map((c) => [c.id, checked.read.includes(c.id) ? now : readAt[c.id]])
      .filter(([, at]) => at);
    result.pagesRead = Object.fromEntries(times);
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

  const { [PAGES_READ_KEY]: readAt = {} } = await chrome.storage.session.get(PAGES_READ_KEY);
  const now = Date.now();
  const ownIds = new Set(channels.map((c) => c.id));

  const listReadLately = (channel) => readLately(channel, previous, readAt, now);
  const own = await checkChannels(channels, previous, listReadLately);
  const { live } = own;
  // Only the added channels live now, so this never grows. One that YouTube answered for had its
  // list read at this check, unless that was left out.
  const ownRead = channels
    .filter((c) => live[c.id])
    .map((c) => [c.id, own.read.includes(c.id) && !listReadLately(c) ? now : readAt[c.id]])
    .filter(([, at]) => at);
  const subs = showSubscriptions
    ? await checkSubscriptions(live, previous, previousSubs, hiddenChannels, ownIds, readAt, now)
    : { subChannels: previousSubs, pagesRead: {}, signedOut: false, consentRequired: false };
  // What was remembered about subscriptions stands when YouTube's list of them couldn't be read.
  const subsRead = Object.entries(subs.pagesRead ?? readAt).filter(([id]) => !ownIds.has(id));
  await chrome.storage.session.set({ [PAGES_READ_KEY]: Object.fromEntries([...subsRead, ...ownRead]) });

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
