// Which of your YouTube subscriptions are live, read from the list in YouTube's left
// sidebar (the guide). One request covers them all, however long they've been live.

import { YT, fetchPage } from './youtube-pages.js';

export function liveChannelsFromGuide(node, found = []) {
  if (Array.isArray(node)) node.forEach((x) => liveChannelsFromGuide(x, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'guideEntryRenderer') {
        liveChannelsFromGuide(value, found);
        continue;
      }
      const id = value.entryData?.guideEntryData?.guideEntryId;
      if (!value.badges?.liveBroadcasting || !/^UC[\w-]{22}$/.test(id ?? '')) continue;
      if (found.some((c) => c.id === id)) continue;
      const handle = value.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl?.match(/^\/(@[^/]+)$/)?.[1];
      found.push({
        id,
        name: value.formattedTitle?.simpleText ?? 'YouTube channel',
        handle: handle ? decodeURIComponent(handle) : null,
        avatar: value.thumbnail?.thumbnails?.at(-1)?.url ?? null,
      });
    }
  }
  return found;
}

async function authorizationHeader() {
  const cookie = await chrome.cookies.get({ url: YT, name: 'SAPISID' });
  if (!cookie) throw new Error('No YouTube sign-in cookie');
  const time = Math.floor(Date.now() / 1000);
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${time} ${cookie.value} ${YT}`));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `SAPISIDHASH ${time}_${hex}`;
}

// What a signed-in YouTube page says about your sign-in, which asking for the guide needs: which of
// your accounts it is, a brand account's page ID, and the version of YouTube's site. Null when the
// page says you're signed out.
export function signInFromPage(html, now) {
  if (!html.includes('"LOGGED_IN":true')) return null;
  const config = (name) => html.match(new RegExp(`"${name}":"?([\\w.]+)`))?.[1];
  return {
    at: now,
    authUser: config('SESSION_INDEX') ?? '0',
    clientVersion: config('INNERTUBE_CLIENT_VERSION') ?? null,
    pageId: html.match(/"DELEGATED_SESSION_ID":"(\d+)"/)?.[1] ?? null,
  };
}

// That page is over 2 MB and what it says rarely changes, so it's read again only this often, not on
// every check. Kept in session storage: the worker can stop between checks, and it's gone when the
// browser closes. Switching YouTube accounts can show the other account's subscriptions until then.
const SIGN_IN_KEY = 'youtubeSignIn';
const SIGN_IN_MS = 15 * 60_000;

// A brand account only gets its own subscriptions with the page ID. sendRequestsAsSite in index.js
// makes the request come from YouTube.
async function fetchGuideChannels({ authUser, clientVersion, pageId }) {
  const res = await fetch(`${YT}/youtubei/v1/guide?prettyPrint=false`, {
    method: 'POST',
    credentials: 'include',
    redirect: 'error', // the sign-in header is only for YouTube
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authorizationHeader(),
      'X-Origin': YT,
      'X-Goog-AuthUser': authUser,
      ...(pageId ? { 'X-Goog-PageId': pageId } : {}),
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: clientVersion ?? undefined } },
    }),
  });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  return liveChannelsFromGuide(await res.json());
}

export async function fetchLiveSubscriptions() {
  const { [SIGN_IN_KEY]: kept } = await chrome.storage.session.get(SIGN_IN_KEY);
  const now = Date.now();
  const fresh = !!kept && now - kept.at < SIGN_IN_MS;
  const signIn = fresh ? kept : signInFromPage((await fetchPage(`${YT}/`)).html, now);
  if (!signIn) {
    await chrome.storage.session.remove(SIGN_IN_KEY);
    return { signedOut: true, channels: [] };
  }
  if (!fresh) await chrome.storage.session.set({ [SIGN_IN_KEY]: signIn });
  try {
    return { signedOut: false, channels: await fetchGuideChannels(signIn) };
  } catch (e) {
    // What was kept may be out of date, after signing out for one, so the next check reads the page again.
    await chrome.storage.session.remove(SIGN_IN_KEY);
    throw e;
  }
}
