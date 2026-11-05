// Wires the YouTube background code to browser events. What every site shares is in
// streams/background/site-background.js.

import { allowCookiesOnTwitch, sendRequestsAsSite } from '../../streams/background/site-background.js';
import { addChannel, removeChannel } from './channels.js';
import { background } from './poller.js';
import { loadStreamDetails } from './live-entry.js';

export const messageHandlers = {
  ...background.messageHandlers('youtube-live'),
  'youtube-live:add': async (msg) => ({ ok: true, channel: await addChannel(msg.input) }),
  'youtube-live:remove': async (msg) => {
    await removeChannel(msg.id);
    return { ok: true };
  },
  'youtube-live:showSubscriptions': async (msg) => {
    await background.setShowFollowed(msg.enabled);
    return { ok: true };
  },
  'youtube-live:loadStreamDetails': async (msg) => {
    await loadStreamDetails(msg.channelId, msg.videoId);
    return { ok: true };
  },
};

export function startBackground() {
  allowCookiesOnTwitch('https://*.youtube.com/*');
  sendRequestsAsSite(1, '||www.youtube.com/youtubei/v1/guide', [{ header: 'origin', operation: 'set', value: 'https://www.youtube.com' }]);
  background.startPolling('youtube-live:poll');
}
