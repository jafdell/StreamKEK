// Wires the Kick background code to browser events. What every site shares is in
// streams/background/site-background.js.

import { allowCookiesOnTwitch, sendRequestsAsSite } from '../../streams/background/site-background.js';
import { addChannel, removeChannel } from './channels.js';
import { startChatSignIn } from './chat-sign-in.js';
import { background } from './poller.js';

export const messageHandlers = {
  ...background.messageHandlers('kick-live'),
  'kick-live:add': async (msg) => ({ ok: true, channel: await addChannel(msg.input) }),
  'kick-live:remove': async (msg) => {
    await removeChannel(msg.id);
    return { ok: true };
  },
  'kick-live:showFollows': async (msg) => {
    await background.setShowFollowed(msg.enabled);
    return { ok: true };
  },
};

export function startBackground() {
  allowCookiesOnTwitch('https://*.kick.com/*');
  sendRequestsAsSite(2, '||kick.com/api/', [
    { header: 'origin', operation: 'set', value: 'https://kick.com' },
    { header: 'referer', operation: 'set', value: 'https://kick.com/' },
  ]);
  background.startPolling('kick-live:poll');
  startChatSignIn();
}
