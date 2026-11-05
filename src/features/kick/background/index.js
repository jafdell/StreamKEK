// Wires the Kick background code to browser events. What every site shares is in
// streams/background/site-background.js.

import { allowCookiesOnTwitch } from '../../streams/background/site-background.js';
import { addChannel, removeChannel } from './channels.js';
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
  allowCookiesOnTwitch('https://*.kick.com/*');
  background.startPolling('kick-live:poll');

  chrome.cookies.onChanged.addListener(({ removed, cookie }) => {
    if (!removed && cookie.name === 'session_token' && cookie.domain.replace(/^\./, '') === 'kick.com') {
      shareSignInWithFrames(cookie);
    }
  });
  chrome.cookies.get({ url: 'https://kick.com/', name: 'session_token' }).then((cookie) => {
    if (cookie) shareSignInWithFrames(cookie);
  });
}
