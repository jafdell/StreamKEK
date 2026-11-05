// Live streams from your YouTube subscriptions.

import { YT, extractJson, fetchPage } from './youtube-pages.js';
import { collectVideoItems, isLiveItem, itemMetadataParts, viewerCount } from './streams.js';

// The text is in the account's language: "126 watching", "3 513 tittare", "3.6K watching".
function parseViewers(parts) {
  return viewerCount(
    parts
      .slice(1)
      .map((p) => p.text?.content ?? '')
      .find((t) => /\d/.test(t)),
  );
}

function feedItemToStream(item) {
  if (!isLiveItem(item)) return null;
  const meta = item.metadata?.lockupMetadataViewModel;
  const text = JSON.stringify(meta ?? {});
  const channelId = text.match(/"browseId":"(UC[\w-]{22})"/)?.[1];
  if (!channelId || !item.contentId) return null;
  const parts = itemMetadataParts(item);
  const handle = text.match(/"canonicalBaseUrl":"\/(@[^"]+)"/)?.[1];
  return {
    channel: {
      id: channelId,
      name: parts[0]?.text?.content ?? 'YouTube channel',
      handle: handle ? decodeURIComponent(handle) : null,
      avatar: text.match(/"url":"(https:\/\/yt3\.[^"]+)"/)?.[1] ?? null,
    },
    videoId: item.contentId,
    title: meta.title?.content ?? '',
    viewers: parseViewers(parts),
  };
}

// One request covers every subscription, whatever their number. The feed only reaches
// back about a day, so a stream that has run longer may not be in it.
export async function fetchLiveSubscriptions() {
  const { html } = await fetchPage(`${YT}/feed/subscriptions`);
  if (!html.includes('"LOGGED_IN":true')) return { signedOut: true, channels: [] };
  const items = collectVideoItems(extractJson(html, 'ytInitialData = '));
  if (!items.length) throw new Error('Subscriptions feed had no items');
  const byChannel = new Map();
  for (const stream of items.map(feedItemToStream)) {
    if (!stream) continue;
    const group = byChannel.get(stream.channel.id) ?? { channel: stream.channel, found: [] };
    group.found.push({ videoId: stream.videoId, title: stream.title, viewers: stream.viewers });
    byChannel.set(stream.channel.id, group);
  }
  return { signedOut: false, channels: [...byChannel.values()] };
}
