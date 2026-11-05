// Runs in a site's chat frame: the Chat font size setting, and floating chat's see-through
// background. The site's own chat.css uses --skek-chat-size and data-skek-transparent. Twitch's own
// chat is in features/chat/font-size.css.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const { settingDefaults } = skek;
  const root = document.documentElement;

  // In the address so the first paint is already right; storage would answer too late.
  const twitchFontSize = location.hash.match(/skek-twitch-font=(\d+)/)?.[1] ?? '14';

  function setFontSize(setting) {
    root.style.setProperty('--skek-chat-size', `${setting === 'twitch' ? twitchFontSize : setting}px`);
  }
  setFontSize(settingDefaults.chatFontSize);
  chrome.storage.local.get(settingDefaults).then(({ chatFontSize }) => setFontSize(chatFontSize));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.chatFontSize) setFontSize(changes.chatFontSize.newValue ?? settingDefaults.chatFontSize);
  });

  // Floating chat draws its background behind this frame; see twitch/view-layouts.js.
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const transparent = event.data?.skekChatTransparent;
    if (typeof transparent === 'boolean') root.toggleAttribute('data-skek-transparent', transparent);
  });
})();
