// Keeps you signed in to Kick's chat and player inside Twitch, without weakening your Kick sign-in.
//
// Kick marks its sign-in cookie SameSite=Lax, so browsers don't give it to Kick's pages framed inside
// other sites, and chat says to log in. YouTube's is SameSite=None, which is why it just works. Making
// Kick's the same would let any site that frames Kick use your sign-in. So the real cookie is left
// alone, and this keeps a partitioned copy of it, which browsers only send to Kick under Twitch.

const KICK = 'https://kick.com/';
const NAME = 'session_token';
const TWITCH_ONLY = { topLevelSite: 'https://twitch.tv', hasCrossSiteAncestor: true };

function saveCopy(cookie) {
  chrome.cookies
    .set({
      url: KICK,
      name: cookie.name,
      value: cookie.value,
      ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
      path: cookie.path,
      secure: true,
      httpOnly: cookie.httpOnly,
      sameSite: 'no_restriction',
      expirationDate: cookie.expirationDate,
      storeId: cookie.storeId,
      partitionKey: TWITCH_ONLY,
    })
    .catch((e) => console.error('StreamKEK: could not copy your Kick sign-in for its chat on Twitch', e));
}

function removeCopy(storeId) {
  chrome.cookies
    .remove({ url: KICK, name: NAME, partitionKey: TWITCH_ONLY, ...(storeId ? { storeId } : {}) })
    .catch((e) => console.error('StreamKEK: could not remove the copy of your Kick sign-in', e));
}

export function startChatSignIn() {
  chrome.cookies.onChanged.addListener(({ removed, cause, cookie }) => {
    if (cookie.name !== NAME || cookie.domain.replace(/^\./, '') !== 'kick.com') return;
    // Only the real cookie counts, not the copy this file writes.
    if (cookie.partitionKey || cookie.sameSite === 'no_restriction') return;
    if (!removed) saveCopy(cookie);
    else if (cause !== 'overwrite') removeCopy(cookie.storeId); // you signed out, or it expired
  });

  chrome.cookies.get({ url: KICK, name: NAME }).then((cookie) => {
    if (cookie) saveCopy(cookie);
    else removeCopy();
  });
}
