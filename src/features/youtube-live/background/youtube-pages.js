// Reads YouTube's public pages using the browser's own session. No API key needed.

export const YT = 'https://www.youtube.com';
const CONCURRENCY = 3;

export async function forEachLimited(items, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) await fn(item);
    }),
  );
}

export function extractJson(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export class ConsentRequired extends Error {
  constructor() {
    super('YouTube is showing its cookie prompt. Open youtube.com, answer it once, then try again.');
  }
}

export async function fetchPage(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (new URL(res.url).hostname.startsWith('consent.')) throw new ConsentRequired();
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  return { html: await res.text(), finalUrl: res.url };
}

export function watchPageSections(initialData) {
  const items = initialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents ?? [];
  return {
    primary: items.find((x) => x.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer,
    secondary: items.find((x) => x.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer,
  };
}

function gameTitle(secondary) {
  const rows = secondary?.metadataRowContainer?.metadataRowContainerRenderer?.rows ?? [];
  for (const row of rows) {
    for (const item of row.richMetadataRowRenderer?.contents ?? []) {
      const r = item.richMetadataRenderer;
      if (r?.style === 'RICH_METADATA_RENDERER_STYLE_BOX_ART') return r.title?.simpleText ?? null;
    }
  }
  return null;
}

// The /live page omits the start time and game; the video's own watch page has them.
// They don't change during a stream, so this is fetched once per stream.
export async function streamDetails(videoId) {
  const { html } = await fetchPage(`${YT}/watch?v=${videoId}`);
  const player = extractJson(html, 'ytInitialPlayerResponse = ');
  const micro = player?.microformat?.playerMicroformatRenderer;
  const { secondary } = watchPageSections(extractJson(html, 'ytInitialData = '));
  return {
    startedAt: micro?.liveBroadcastDetails?.startTimestamp ?? null,
    category: gameTitle(secondary) || micro?.category || null,
  };
}
