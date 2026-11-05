// Wires the Kick Live background code to browser events. The sidebar section, stream view and
// Following page are shared with YouTube Live, in streams/twitch/.

import { addChannel, hideChannel, poll, pollIfTwitchOpen, removeChannel, setShowFollows, unhideChannel } from './poller.js';

const POLL_ALARM = 'kick-live:poll';
const POLL_MINUTES = 1;
const STALE_MS = 60_000;

export const messageHandlers = {
  'kick-live:add': async (msg) => ({ ok: true, channel: await addChannel(msg.input) }),
  'kick-live:remove': async (msg) => {
    await removeChannel(msg.id);
    return { ok: true };
  },
  'kick-live:hide': async (msg) => {
    await hideChannel(msg.id);
    return { ok: true };
  },
  'kick-live:unhide': async (msg) => {
    await unhideChannel(msg.id);
    return { ok: true };
  },
  'kick-live:showFollows': async (msg) => {
    await setShowFollows(msg.enabled);
    return { ok: true };
  },
  'kick-live:refresh': async (msg) => {
    const { kickStatus } = await chrome.storage.local.get('kickStatus');
    if (msg.force || !kickStatus || Date.now() - kickStatus.checkedAt > STALE_MS) await poll();
    return { ok: true };
  },
};

// Kick marks its sign-in cookie SameSite=Lax, so browsers don't give it to Kick's pages framed
// inside Twitch, and chat says to log in. YouTube's is SameSite=None, which is why it just works.
// So this makes Kick's the same. Kick's API also wants the token in a header, so a cross-site
// request carrying only the cookie isn't signed in there. Kick can set the cookie again at any
// time, which onChanged below catches.
function shareSignInWithFrames(cookie) {
  if (cookie.sameSite === 'no_restriction') return;
  chrome.cookies
    .set({
      url: 'https://kick.com/',
      name: cookie.name,
      value: cookie.value,
      ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
      path: cookie.path,
      secure: true,
      httpOnly: cookie.httpOnly,
      sameSite: 'no_restriction',
      expirationDate: cookie.expirationDate,
      storeId: cookie.storeId,
    })
    .catch((e) => console.error('StreamKEK: could not share your Kick sign-in with its chat', e));
}

export function startBackground() {
  // Kick's chat needs your Kick sign-in while framed inside Twitch, which browsers block as a
  // cross-site cookie. This allows only Kick cookies, and only on twitch.tv. Browsers remove the
  // exception when the extension is uninstalled.
  chrome.contentSettings.cookies
    .set({
      primaryPattern: 'https://*.kick.com/*',
      secondaryPattern: 'https://www.twitch.tv/*',
      setting: 'allow',
    })
    .catch((e) => console.error('StreamKEK: could not allow Kick cookies on Twitch', e));

  chrome.cookies.onChanged.addListener(({ removed, cookie }) => {
    if (!removed && cookie.name === 'session_token' && cookie.domain.replace(/^\./, '') === 'kick.com') {
      shareSignInWithFrames(cookie);
    }
  });
  chrome.cookies.get({ url: 'https://kick.com/', name: 'session_token' }).then((cookie) => {
    if (cookie) shareSignInWithFrames(cookie);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) pollIfTwitchOpen();
  });
  // Creating an alarm restarts its countdown, and this runs each time the service worker
  // wakes, so only create it when it's missing or has an old interval.
  chrome.alarms.get(POLL_ALARM).then((alarm) => {
    if (alarm?.periodInMinutes !== POLL_MINUTES) chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_MINUTES });
  });
}
