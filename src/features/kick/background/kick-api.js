// Reads Kick's site API with your own sign-in. Kick's own pages make these same requests.
// sendRequestsAsSite in index.js makes them come from Kick rather than from the extension.

import { textOf, webUrl } from '../../streams/background/about-text.js';

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

// A channel's name goes into addresses, so only trust what looks like one.
const isSlug = (slug) => /^[\w-]+$/.test(slug ?? '');

export function followedStreamToLive(item) {
  const slug = item.channel?.slug;
  if (!isSlug(slug) || item.id == null) return null;
  return { channel: toChannel(slug, item.channel.user?.username, item.channel.user?.profilepic), entry: toEntry(item) };
}

export function channelPageToLive(page) {
  if (!isSlug(page.slug)) return null;
  return {
    channel: toChannel(page.slug, page.user?.username, page.user?.profile_pic),
    entry: page.livestream?.is_live ? toEntry(page.livestream) : null,
  };
}

// Where each of the names a channel gives for itself leads, as Kick's own About page links them.
const SOCIALS = [
  { key: 'instagram', name: 'Instagram', base: 'https://instagram.com/' },
  { key: 'twitter', name: 'X', base: 'https://x.com/' },
  { key: 'youtube', name: 'YouTube', base: 'https://youtube.com/' },
  { key: 'discord', name: 'Discord', base: 'https://discord.gg/' },
  { key: 'tiktok', name: 'TikTok', base: 'https://tiktok.com/@' },
  { key: 'facebook', name: 'Facebook', base: 'https://facebook.com/' },
];
const PANEL_IMAGES = 'files.kick.com';
const MOST_PANELS = 40;

function socialLink({ name, base }, value) {
  const url = value ? webUrl(`${base}${value}`) : null;
  return url && new URL(url).hostname === new URL(base).hostname ? { name, url } : null;
}

function toPanel(link) {
  const image = webUrl(link.image?.url);
  const panel = {
    title: textOf(link.title, 200),
    text: textOf(link.description, 2000),
    link: webUrl(textOf(link.link, 2000)),
    image: image?.startsWith(`https://${PANEL_IMAGES}/`) ? image : null,
  };
  return panel.title || panel.text || panel.image ? panel : null;
}

// What the stream view shows under a Kick stream, from the channel and its list of links, which
// are the pictures and texts on Kick's own About page. Everything here was written by the
// streamer, so the page gets only plain text, addresses that open a website, and pictures from
// Kick's own server. youtube/background/about.js gives the same shape.
export function channelAbout(page, links) {
  const followers = Number(page.followers_count);
  const user = page.user ?? {};
  return {
    followers: page.followers_count != null && Number.isFinite(followers) ? followers : null,
    verified: !!page.verified,
    // Only YouTube's streams have a description of their own.
    stream: '',
    bio: textOf(user.bio, 2000),
    socials: SOCIALS.map((social) => socialLink(social, textOf(user[social.key], 200))).filter(Boolean),
    panels: (Array.isArray(links) ? links : [])
      .filter((link) => link && typeof link === 'object')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .slice(0, MOST_PANELS)
      .map(toPanel)
      .filter(Boolean),
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
    redirect: 'error', // the token is only for Kick
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

// A channel's About section. Anyone can read it, so the sign-in's token isn't sent. Null when
// there's no such channel. A channel whose links can't be read still has the rest.
export async function fetchAbout(slug) {
  if (!isSlug(slug)) return null;
  const name = encodeURIComponent(slug);
  const [channel, links] = await Promise.all([
    request(`/api/v2/channels/${name}`),
    request(`/api/v1/channels/${name}/links`).catch(() => null),
  ]);
  if (channel.status === 404) return null;
  if (!channel.ok) throw new Error(`Kick answered ${channel.status}`);
  return channelAbout(await channel.json(), links?.ok ? await links.json().catch(() => []) : []);
}
