// Runs in a site's chat frame: the Theme setting, the Chat font size setting, and floating chat's
// see-through background, with which edge its messages line up against and whether each has a
// background of its own. The site's own chat.css uses data-skek-theme, data-skek-theme-base,
// --skek-chat-size, data-skek-transparent, data-skek-float-align, data-skek-float-messages and
// --skek-float-opacity. Twitch's own chat is in features/chat/font-size.css and player/modes.css.
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
  // In the address so the first paint is already right; storage would answer too late.
  setTheme(resolveTheme(location.hash.match(/skek-theme=([\w-]+)/)?.[1]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) setTheme(resolveTheme(changes.theme.newValue));
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

  // Floating chat draws its background behind this frame; see twitch/view-frames.js. Its window's
  // switches, in player/floating-window.js, say how the messages look.
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const transparent = event.data?.skekChatTransparent;
    if (typeof transparent !== 'boolean') return;
    root.toggleAttribute('data-skek-transparent', transparent);
    const float = transparent ? event.data.skekChatFloat : null;
    if (float?.align === 'right') root.dataset.skekFloatAlign = 'right';
    else delete root.dataset.skekFloatAlign;
    root.toggleAttribute('data-skek-float-messages', float?.messagesOnly === true);
    const opacity = Number(float?.opacity);
    root.style.setProperty('--skek-float-opacity', String(opacity >= 0 && opacity <= 1 ? opacity : 0));
  });
})();
