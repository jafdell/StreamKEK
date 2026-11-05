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

// `html` is any signed-in YouTube page. A brand account only gets its own subscriptions
// with the page ID. rules/youtube-guide-origin.json makes the request come from YouTube.
async function fetchGuideChannels(html) {
  const config = (name) => html.match(new RegExp(`"${name}":"?([\\w.]+)`))?.[1];
  const pageId = html.match(/"DELEGATED_SESSION_ID":"(\d+)"/)?.[1];
  const res = await fetch(`${YT}/youtubei/v1/guide?prettyPrint=false`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authorizationHeader(),
      'X-Origin': YT,
      'X-Goog-AuthUser': config('SESSION_INDEX') ?? '0',
      ...(pageId ? { 'X-Goog-PageId': pageId } : {}),
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: config('INNERTUBE_CLIENT_VERSION') } },
    }),
  });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  return liveChannelsFromGuide(await res.json());
}

export async function fetchLiveSubscriptions() {
  const { html } = await fetchPage(`${YT}/`);
  if (!html.includes('"LOGGED_IN":true')) return { signedOut: true, channels: [] };
  return { signedOut: false, channels: await fetchGuideChannels(html) };
}
