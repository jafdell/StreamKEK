// Keeps every Twitch page in step with the extension's settings.
(() => {
  'use strict';

  // Also runs in Twitch's chat in the multi-stream view, but not in that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const { SETTINGS, settingDefaults } = skek;

  // CSS gated on html[data-skek-on~='<key>'] can't flash when Twitch re-renders, and
  // an attribute survives if anything ever overwrites <html>'s class.
  function applySettings() {
    chrome.storage.local.get(settingDefaults).then((values) => {
      const root = document.documentElement;
      root.dataset.skekOn = SETTINGS.filter((s) => values[s.key] === true).map((s) => s.key).join(' ');
      root.dataset.skekTheme = values.theme;
      root.dataset.skekQuality = values.streamQuality;
      root.toggleAttribute('data-skek-chat-font', values.chatFontSize !== 'twitch');
      root.style.setProperty('--skek-chat-font-size', `${values.chatFontSize}px`);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SETTINGS.some((s) => s.key in changes)) applySettings();
  });
  applySettings();
})();
