// Reads Kick's site API with your own sign-in. Kick's own pages make these same requests.
// rules/kick-api-origin.json makes them come from Kick rather than from the extension.

const KICK = 'https://kick.com';

// Kick's times have no time zone, but they're UTC: "2026-11-05 11:21:54".
export function startedAtIso(text) {
  if (!text) return null;
  const date = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toChannel(slug, username, avatar) {
  return { id: `kick:${slug}`, platform: 'kick', slug, name: username ?? slug, handle: null, avatar: avatar ?? null };
}

// The same shape as a YouTube channel's entry in `live`, see youtube/background/poller.js.
// A Kick channel has one stream at a time. `thumbnail` is only known for followed channels.
function toEntry(stream) {
  const top = {
    videoId: String(stream.id),
    title: stream.session_title ?? '',
    category: stream.categories?.[0]?.name ?? 'Kick',
    viewers: stream.viewer_count ?? null,
    startedAt: startedAtIso(stream.start_time),
    thumbnail: stream.thumbnail?.src ?? stream.thumbnail?.url ?? null,
  };
  return { ...top, streams: [top] };
}

export function followedStreamToLive(item) {
  const slug = item.channel?.slug;
  if (!slug || item.id == null) return null;
  return { channel: toChannel(slug, item.channel.user?.username, item.channel.user?.profilepic), entry: toEntry(item) };
}

export function channelPageToLive(page) {
  if (!page.slug) return null;
  return {
    channel: toChannel(page.slug, page.user?.username, page.user?.profile_pic),
    entry: page.livestream?.is_live ? toEntry(page.livestream) : null,
  };
}

// Turns a name or Kick link someone pasted into the channel's name in Kick's addresses.
export function slugFromInput(raw) {
  const input = raw.trim();
  if (/^@?[\w-]+$/.test(input)) return input.replace(/^@/, '').toLowerCase();
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (!/^([\w-]+\.)?kick\.com$/i.test(url.hostname)) return null;
  const [first, second] = url.pathname.split('/').filter(Boolean);
  const slug = first === 'popout' ? second : first;
  return /^[\w-]+$/.test(slug ?? '') ? slug.toLowerCase() : null;
}

async function sessionToken() {
  const cookie = await chrome.cookies.get({ url: KICK, name: 'session_token' });
  return cookie ? decodeURIComponent(cookie.value) : null;
}

async function request(path, token) {
  return fetch(`${KICK}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

// Every followed channel that's live right now, in one request.
export async function fetchFollowedLive() {
  const token = await sessionToken();
  if (!token) return { signedOut: true, channels: [] };
  const res = await request('/api/v1/user/livestreams', token);
  if (res.status === 401) return { signedOut: true, channels: [] };
  if (!res.ok) throw new Error(`Kick answered ${res.status}`);
  return { signedOut: false, channels: (await res.json()).map(followedStreamToLive).filter(Boolean) };
}

// A channel by name, followed or not. Null when there's no such channel.
export async function fetchChannel(slug) {
  const path = `/api/v2/channels/${encodeURIComponent(slug)}`;
  const token = await sessionToken();
  let res = await request(path, token);
  // An expired sign-in shouldn't stop what anyone can read.
  if (res.status === 401 && token) res = await request(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Kick answered ${res.status}`);
  return channelPageToLive(await res.json());
}
