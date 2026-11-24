// The About section for the stream view, which on YouTube is the stream's own description, as
// under the video on YouTube: that's where a YouTube streamer puts what a Twitch streamer keeps in
// the About section. It's read from the stream's watch page. The answer has the same shape as
// Kick's, from channelAbout in kick/background/kick-api.js, with only `stream` filled in.

import { textOf } from '../../streams/background/about-text.js';
import { YT, extractJson, fetchPage } from './youtube-pages.js';

const CHANNEL_ID = /^UC[\w-]{22}$/;
const VIDEO_ID = /^[\w-]{11}$/;

// What a stream says about itself. Empty when the video isn't that channel's.
export function streamDescription(playerResponse, channelId) {
  const details = playerResponse?.videoDetails;
  return details?.channelId === channelId ? textOf(details.shortDescription, 5000) : '';
}

// Null for a stream with no description, so no section shows.
export async function fetchAbout(channelId, videoId) {
  if (!CHANNEL_ID.test(channelId ?? '') || !VIDEO_ID.test(videoId ?? '')) return null;
  const { html } = await fetchPage(`${YT}/watch?v=${videoId}`);
  const stream = streamDescription(extractJson(html, 'ytInitialPlayerResponse = '), channelId);
  return stream ? { followers: null, verified: false, stream, bio: '', socials: [], panels: [] } : null;
}
