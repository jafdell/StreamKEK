// Notes a first install, so the Twitch page can point out the extension's button in its top bar
// once (src/twitch/button-intro.js). An update, the Reload button on the extensions page and the
// browser updating itself don't count, so nobody who already has StreamKEK sees it.

export function isFirstInstall({ reason }) {
  return reason === 'install';
}

export function noteInstall(details) {
  if (isFirstInstall(details)) chrome.storage.local.set({ buttonIntro: true });
}
