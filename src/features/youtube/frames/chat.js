// Runs in YouTube's chat frame. Only activates when that frame is inside Twitch, so normal YouTube
// pages stay untouched. streams/frames/chat-settings.js handles font size and floating chat.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const { settingDefaults } = skek;
  const root = document.documentElement;
  root.classList.add('skek');

  // Twitch's default username colours, chosen per name so a chatter stays one colour.
  const COLORS = [
    '#ff0000', '#0000ff', '#008000', '#b22222', '#ff7f50', '#9acd32', '#ff4500', '#2e8b57',
    '#daa520', '#d2691e', '#5f9ea0', '#1e90ff', '#ff69b4', '#8a2be2', '#00ff7f',
  ];
  // Readable stand-ins for the colours that fade into each theme's background.
  const READABLE = {
    dark: { '#0000ff': '#6b6bff', '#008000': '#2ea82e', '#8a2be2': '#a970ff', '#b22222': '#e05050' },
    light: {
      '#ff7f50': '#d9531e', '#9acd32': '#5f8a12', '#daa520': '#a87c0c', '#5f9ea0': '#3b7c7f',
      '#1e90ff': '#1a6fd1', '#ff69b4': '#d6277f', '#00ff7f': '#008f4c',
    },
  };

  function colorFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const color = COLORS[Math.abs(hash) % COLORS.length];
    return READABLE[root.dataset.skekTheme]?.[color] ?? color;
  }

  function paint(repaintAll = false) {
    for (const author of document.querySelectorAll('yt-live-chat-text-message-renderer #author-name')) {
      const name = author.textContent.trim();
      if (repaintAll || author.dataset.skekName !== name) {
        author.dataset.skekName = name;
        author.style.color = colorFor(name);
      }
    }
  }

  function setTheme(theme) {
    root.dataset.skekTheme = theme;
    // YouTube's own dark mode covers parts we don't restyle (menus, super chats).
    root.toggleAttribute('dark', theme === 'dark');
    paint(true);
  }
  // Read from the address so the first paint is already right; storage would answer too late.
  setTheme(location.hash.match(/skek-theme=(\w+)/)?.[1] ?? settingDefaults.theme);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) setTheme(changes.theme.newValue ?? settingDefaults.theme);
  });

  // YouTube sets this attribute itself while loading, going by its own theme setting.
  new MutationObserver(() => {
    const dark = root.dataset.skekTheme === 'dark';
    if (root.hasAttribute('dark') !== dark) root.toggleAttribute('dark', dark);
  }).observe(root, { attributes: true, attributeFilter: ['dark'] });

  let queued = false;
  function start() {
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        paint();
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
    paint();
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
