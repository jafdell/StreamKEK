// Keeps Kick's chat and player working inside Twitch, without weakening your Kick cookies.
//
// Kick marks its cookies SameSite=Lax, so browsers don't give them to Kick's pages framed inside other
// sites: chat says to log in, and without your consent choice the player may never start. YouTube's
// sign-in is SameSite=None, which is why it just works. Making Kick's the same would let any site that
// frames Kick use your sign-in. So the real cookies are left alone, and this keeps partitioned copies
// of them, which browsers only send to Kick under Twitch. Only what you set on kick.com is copied.

const KICK = 'https://kick.com/';
const TWITCH_ONLY = { topLevelSite: 'https://twitch.tv', hasCrossSiteAncestor: true };
const COPIED = [
  'session_token', // your sign-in
  'cookie_preferences_set_v1', // the rest is your answer to Kick's consent banner
  'cookie_preferences_set_v2',
  'OptanonAlertBoxClosed',
  'OptanonConsent',
  'eupubconsent-v2',
];
// Nothing can delete a copy once the extension is removed or turned off, so each one only lasts a day.
// The service worker saves them again every time it wakes.
const COPY_LIFETIME_SECONDS = 24 * 60 * 60;

export function copyExpiry(realExpiry, nowSeconds) {
  return Math.min(realExpiry ?? Infinity, nowSeconds + COPY_LIFETIME_SECONDS);
}

// Only the real cookies count, not the copies this file writes. A copy is told apart by its partition,
// not its SameSite: a real cookie marked SameSite=None still has to remove its copy on sign-out.
export function isRealCookie(cookie) {
  return COPIED.includes(cookie.name) && cookie.domain.replace(/^\./, '') === 'kick.com' && !cookie.partitionKey;
}

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
      expirationDate: copyExpiry(cookie.expirationDate, Date.now() / 1000),
      storeId: cookie.storeId,
      partitionKey: TWITCH_ONLY,
    })
    .catch((e) => console.error(`StreamKEK: could not copy Kick's ${cookie.name} cookie for Twitch`, e));
}

function removeCopy(name, storeId) {
  chrome.cookies
    .remove({ url: KICK, name, partitionKey: TWITCH_ONLY, ...(storeId ? { storeId } : {}) })
    .catch((e) => console.error(`StreamKEK: could not remove the copy of Kick's ${name} cookie`, e));
}

export function startTwitchFrameCookies() {
  chrome.cookies.onChanged.addListener(({ removed, cause, cookie }) => {
    if (!isRealCookie(cookie)) return;
    if (!removed) saveCopy(cookie);
    else if (cause !== 'overwrite') removeCopy(cookie.name, cookie.storeId); // you signed out, or it expired
  });

  for (const name of COPIED) {
    chrome.cookies.get({ url: KICK, name }).then((cookie) => {
      if (cookie) saveCopy(cookie);
      else removeCopy(name);
    });
  }
}
