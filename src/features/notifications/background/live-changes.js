// The Notify me when a favorite goes live setting's arithmetic: which favorites have started a
// stream since the last check, and what their notification says and opens. Nothing from the browser
// in here, so tests can run it, and site-background.js can ask which favorites there are.

// Longer than this between two checks means the browser was closed or asleep. Whoever is live after
// that is only noted, so opening the browser doesn't notify you about every favorite at once.
const MAX_GAP_MS = 10 * 60_000;

// How each site's streams are addressed on Twitch. A module can't import ../../streams/sites.js, so a
// test checks that these match its routePrefix.
export const SITE_NAMES = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };
export const ROUTE_PREFIXES = { youtube: 'yt', kick: 'kick' };

// YouTube's channels were saved before there were other sites, so they don't say. As in sites.js.
export const platformOf = (channel) => channel?.platform ?? 'youtube';

// The setting's default is repeated here, since the service worker has no skek. Keep it equal to
// the one in src/settings.js.
export async function notifiedFavorites() {
  const { liveNotifications = false, favoriteChannels = [] } = await chrome.storage.local.get(['liveNotifications', 'favoriteChannels']);
  return liveNotifications ? favoriteChannels : [];
}

// One site's favorites after a check. `seen` is what the check before left, { at, streams }, where
// streams has each favorite's last known stream ids, kept while it's offline. `liveIds` has the
// stream ids of the favorites live now. A favorite has started when it's live with none of the
// streams it had before, so a stream that drops out and comes back doesn't notify twice. A channel
// that's new to Favorites is only noted, since you've just seen it's live.
export function liveChanges(seen, favorites, liveIds, at) {
  const quiet = !seen || at - seen.at > MAX_GAP_MS;
  const streams = {};
  const started = [];
  for (const { id } of favorites) {
    const now = liveIds[id] ?? [];
    const before = seen?.streams?.[id];
    if (!quiet && before && now.length && !now.some((streamId) => before.includes(streamId))) started.push(id);
    streams[id] = now.length ? now : (before ?? []);
  }
  return { seen: { at, streams }, started };
}

// The same address the sidebar's card for the channel opens. As slugFor in streams/twitch/routes.js.
export function streamAddress(channel) {
  const platform = platformOf(channel);
  if (platform === 'twitch') return `https://www.twitch.tv/${encodeURIComponent(channel.login)}`;
  const name = channel.slug ?? channel.handle?.replace(/^@/, '') ?? channel.id;
  return `https://www.twitch.tv/${ROUTE_PREFIXES[platform]}/${encodeURIComponent(name.toLowerCase())}`;
}

// Titles come from the sites as typed, so with line breaks and runs of spaces now and then.
const tidy = (text) => (text ?? '').replace(/\s+/g, ' ').trim();

// `stream` is { name, title, category }, each of which may be missing. The site is in the title
// because not every system shows contextMessage: Windows and Linux can leave it out.
export function notificationFor(channel, stream) {
  const title = tidy(stream.title);
  const category = tidy(stream.category);
  return {
    title: `${tidy(stream.name) || channel.name} is live on ${SITE_NAMES[platformOf(channel)]}`,
    message: title || category || 'Streaming now',
    contextMessage: title ? category : '',
  };
}

// A notification's id holds when it was made and the address it opens, so a click still knows where
// to go after the service worker has stopped and started again. The time makes every id new: given
// an id that's still in the computer's notification list, the system quietly updates that one in
// place instead of showing it again.
const NOTIFICATION_ID = /^live:\d+:(https:\/\/www\.twitch\.tv\/.+)$/;

export function notificationId(at, address) {
  return `live:${at}:${address}`;
}

// Null for an id that isn't one of these.
export function notificationAddress(id) {
  return id.match(NOTIFICATION_ID)?.[1] ?? null;
}

// Whether a tab is already on the page a notification opens, so a click can go to it.
export function isSamePage(tabUrl, address) {
  const page = (url) => {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname.replace(/\/+$/, '').toLowerCase()}`;
  };
  try {
    return page(tabUrl) === page(address);
  } catch {
    return false;
  }
}
