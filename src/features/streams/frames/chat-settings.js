// Runs in a site's chat frame: the Theme setting, the Chat font size setting, and floating chat's
// see-through background. The site's own chat.css uses data-skek-theme, data-skek-theme-base,
// --skek-chat-size and data-skek-transparent. Twitch's own chat is in features/chat/font-size.css.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const { settingDefaults, resolveTheme } = skek;
  const root = document.documentElement;

  // `name` picks the theme's colors from features/themes/palettes.css, and `base` says whether
  // it's a dark or a light one.
  function setTheme({ name, base }) {
    root.dataset.skekTheme = name;
    root.dataset.skekThemeBase = base;
  }
  // The Twitch page puts the theme it's showing in the address, so the first paint is already
  // right, and this never has to ask what Twitch's own theme is.
  setTheme(resolveTheme(location.hash.match(/skek-theme=([\w-]+)/)?.[1]));
  // twitchTheme is Twitch's own theme, which the Twitch page saves for the Twitch choice.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(changes.theme || changes.twitchTheme)) return;
    chrome.storage.local
      .get({ theme: settingDefaults.theme, twitchTheme: null })
      .then(({ theme, twitchTheme }) => setTheme(resolveTheme(theme, twitchTheme)));
  });

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
