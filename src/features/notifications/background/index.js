// The Notify me when a favorite goes live setting: a notification when a channel in Favorites starts
// a stream, also with no Twitch tab open. YouTube's and Kick's favorites are read from what their
// own checks save, which site-background.js keeps running without a Twitch tab while this is on.
// Twitch's are asked for here. What counts as going live is in live-changes.js.

import { KEYS as kickKeys } from '../../kick/background/poller.js';
import { KEYS as youtubeKeys } from '../../youtube/background/poller.js';
import { isSamePage, liveChanges, notificationAddress, notificationFor, notificationId, notifiedFavorites, platformOf, streamAddress } from './live-changes.js';
import { fetchTwitchLive } from './twitch-live.js';

const ALARM = 'notifications:poll';
const POLL_MINUTES = 1;
const SEEN_KEY = 'liveNotificationsSeen';
// A site's saved streams older than this are from before the browser was closed.
const FRESH_MS = 3 * 60_000;
const SITE_KEYS = { youtube: youtubeKeys, kick: kickKeys };

// One at a time, since each reads what the last one saved.
let queue = Promise.resolve();

export const messageHandlers = {};

// Takes the place of the channel's last one if that's still showing, so they don't pile up.
async function show(channel, stream) {
  const address = streamAddress(channel);
  try {
    for (const id of Object.keys(await chrome.notifications.getAll())) {
      if (notificationAddress(id) === address) chrome.notifications.clear(id);
    }
    await chrome.notifications.create(notificationId(Date.now(), address), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/128.png'),
      ...notificationFor(channel, stream),
    });
  } catch (e) {
    console.warn(`StreamKEK: could not notify that ${channel.name} is live`, e);
  }
}

// `live` is { [channelId]: { ids, name, title, category } } for the favorites live at `at`.
async function compare(platform, favorites, live, at) {
  const { [SEEN_KEY]: saved = {} } = await chrome.storage.local.get(SEEN_KEY);
  if (saved[platform]?.at === at) return;
  const liveIds = Object.fromEntries(Object.entries(live).map(([id, stream]) => [id, stream.ids]));
  const { seen, started } = liveChanges(saved[platform], favorites, liveIds, at);
  await chrome.storage.local.set({ [SEEN_KEY]: { ...saved, [platform]: seen } });
  for (const id of started) show(favorites.find((c) => c.id === id), live[id]);
}

async function check(platform, readLive) {
  const favorites = (await notifiedFavorites()).filter((c) => platformOf(c) === platform);
  if (!favorites.length) return;
  const result = await readLive(favorites);
  if (!result) return;
  queue = queue.then(() => compare(platform, favorites, result.live, result.at)).catch((e) => console.warn('StreamKEK: could not compare live favorites', e));
  await queue;
}

async function readTwitch(favorites) {
  try {
    return { live: await fetchTwitchLive(favorites.map((c) => c.login)), at: Date.now() };
  } catch (e) {
    console.warn('StreamKEK: could not check favorites on Twitch', e);
    return null;
  }
}

// A stream is { videoId, title, category }, and a channel's entry is its most watched one.
async function readSite(platform) {
  const keys = SITE_KEYS[platform];
  const saved = await chrome.storage.local.get([keys.live, keys.status]);
  const at = saved[keys.status]?.checkedAt;
  if (!at || Date.now() - at > FRESH_MS) return null;
  const live = {};
  for (const [id, entry] of Object.entries(saved[keys.live] ?? {})) {
    const ids = (entry.streams ?? [entry]).map((stream) => stream.videoId).filter(Boolean);
    if (ids.length) live[id] = { ids, title: entry.title, category: entry.category };
  }
  return { live, at };
}

// Goes to a tab that's already on the stream, or opens one. With the browser running but no window
// open, as a Mac allows, there's nowhere to put a tab, so it opens a window.
async function openStream(address) {
  const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
  const tab = tabs.find((candidate) => isSamePage(candidate.url, address));
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return;
  }
  try {
    const created = await chrome.tabs.create({ url: address });
    await chrome.windows.update(created.windowId, { focused: true });
  } catch {
    await chrome.windows.create({ url: address, focused: true });
  }
}

function onClicked(id) {
  const address = notificationAddress(id);
  if (!address) return;
  chrome.notifications.clear(id);
  openStream(address).catch((e) => console.warn('StreamKEK: could not open the stream', e));
}

export function startBackground() {
  chrome.notifications.onClicked.addListener(onClicked);

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) check('twitch', readTwitch);
  });
  // Creating an alarm restarts its countdown, so only when it's missing. See site-background.js.
  chrome.alarms.get(ALARM).then((alarm) => {
    if (alarm?.periodInMinutes !== POLL_MINUTES) chrome.alarms.create(ALARM, { periodInMinutes: POLL_MINUTES });
  });

  // Each site's check ends by saving when it ran.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [platform, keys] of Object.entries(SITE_KEYS)) {
      if (changes[keys.status]) check(platform, () => readSite(platform));
    }
  });
}
