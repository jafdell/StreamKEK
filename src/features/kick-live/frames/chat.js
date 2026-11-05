// Runs in Kick's chat frame in the stream view, where chat.css makes it look like Twitch's.
// Normal Kick tabs are untouched.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const { settingDefaults } = skek;
  const root = document.documentElement;
  // An attribute, because Kick's page could reset <html>'s classes when it starts up.
  root.toggleAttribute('data-skek-kick-chat', true);

  const twitchFontSize = location.hash.match(/skek-twitch-font=(\d+)/)?.[1] ?? '14';

  // The Chat font size setting. Twitch's own chat is in features/chat-font-size/.
  function setFontSize(setting) {
    root.style.setProperty('--skek-chat-size', `${setting === 'twitch' ? twitchFontSize : setting}px`);
  }
  setFontSize(settingDefaults.chatFontSize);
  chrome.storage.local.get(settingDefaults).then(({ chatFontSize }) => setFontSize(chatFontSize));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.chatFontSize) setFontSize(changes.chatFontSize.newValue ?? settingDefaults.chatFontSize);
  });

  // Floating chat draws its background behind this frame; see player-view.js.
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const transparent = event.data?.skekChatTransparent;
    if (typeof transparent === 'boolean') root.toggleAttribute('data-skek-transparent', transparent);
  });
})();
