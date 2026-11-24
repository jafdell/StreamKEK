// Background entry point. Each feature provides message handlers and a start function.
// Keep one onMessage listener: a second one would race this one's reply.

import {
  messageHandlers as youtubeLiveHandlers,
  startBackground as startYoutubeLive,
} from '../features/youtube/background/index.js';
import { messageHandlers as kickLiveHandlers, startBackground as startKickLive } from '../features/kick/background/index.js';
import {
  messageHandlers as notificationHandlers,
  startBackground as startNotifications,
} from '../features/notifications/background/index.js';
import { moveRenamedSettings } from './renamed-settings.js';
import { noteUpdate } from './whats-new.js';

const handlers = { __proto__: null, ...youtubeLiveHandlers, ...kickLiveHandlers, ...notificationHandlers }; // so 'constructor' etc. stay unknown types

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = async () => {
    const handler = handlers[msg.type];
    return handler ? handler(msg) : { ok: false, error: 'Unknown request.' };
  };
  run()
    .then(reply)
    .catch((e) => reply({ ok: false, error: e.message }));
  return true; // keeps the channel open for the async reply
});

chrome.runtime.onInstalled.addListener(noteUpdate);

moveRenamedSettings();
startYoutubeLive();
startKickLive();
startNotifications();
