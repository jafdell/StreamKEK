// Wires the YouTube Live background code to browser events.

import { addChannel, removeChannel } from './channels.js';
import { poll, pollIfTwitchOpen, setShowSubscriptions } from './poller.js';
import { loadStreamDetails } from './streams.js';

const POLL_ALARM = 'youtube-live:poll';
const POLL_MINUTES = 1;
const STALE_MS = 60_000;

export const messageHandlers = {
  'youtube-live:add': async (msg) => ({ ok: true, channel: await addChannel(msg.input) }),
  'youtube-live:remove': async (msg) => {
    await removeChannel(msg.id);
    return { ok: true };
  },
  'youtube-live:showSubscriptions': async (msg) => {
    await setShowSubscriptions(msg.enabled);
    return { ok: true };
  },
  'youtube-live:loadStreamDetails': async (msg) => {
    await loadStreamDetails(msg.channelId, msg.videoId);
    return { ok: true };
  },
  'youtube-live:refresh': async (msg) => {
    const { status } = await chrome.storage.local.get('status');
    if (msg.force || !status || Date.now() - status.checkedAt > STALE_MS) await poll();
    return { ok: true };
  },
};

export function startBackground() {
  // The chat and player need your YouTube sign-in while framed inside Twitch, which
  // browsers block as a cross-site cookie. This allows only YouTube cookies, and only
  // on twitch.tv. Browsers remove the exception when the extension is uninstalled.
  chrome.contentSettings.cookies
    .set({
      primaryPattern: 'https://*.youtube.com/*',
      secondaryPattern: 'https://www.twitch.tv/*',
      setting: 'allow',
    })
    .catch((e) => console.error('StreamKEK: could not allow YouTube cookies on Twitch', e));

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) pollIfTwitchOpen();
  });
  // Creating an alarm restarts its countdown, and this runs each time the service worker
  // wakes, so only create it when it's missing or has an old interval.
  chrome.alarms.get(POLL_ALARM).then((alarm) => {
    if (alarm?.periodInMinutes !== POLL_MINUTES) chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_MINUTES });
  });
}
