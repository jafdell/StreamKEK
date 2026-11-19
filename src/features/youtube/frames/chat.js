// Runs in YouTube's chat frame. Only activates when that frame is inside Twitch, so normal YouTube
// pages stay untouched. streams/frames/chat-settings.js handles font size and floating chat.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const root = document.documentElement;
  root.classList.add('skek');

  // Twitch's default username colours, chosen per name so a chatter stays one colour.
  const COLORS = [
    '#ff0000', '#0000ff', '#008000', '#b22222', '#ff7f50', '#9acd32', '#ff4500', '#2e8b57',
    '#daa520', '#d2691e', '#5f9ea0', '#1e90ff', '#ff69b4', '#8a2be2', '#00ff7f',
  ];
  // Readable stand-ins for the colours that fade into a dark or a light theme's background.
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
    return READABLE[root.dataset.skekThemeBase]?.[color] ?? color;
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

  // streams/frames/chat-settings.js keeps the theme on <html>. YouTube's own dark mode covers the
  // parts we don't restyle (menus, super chats), and YouTube sets that attribute itself while
  // loading, going by its own theme setting.
  let paintedBase = null;
  function followTheme() {
    const base = root.dataset.skekThemeBase;
    if (root.hasAttribute('dark') !== (base === 'dark')) root.toggleAttribute('dark', base === 'dark');
    if (base === paintedBase) return;
    paintedBase = base;
    paint(true);
  }
  followTheme();
  new MutationObserver(followTheme).observe(root, { attributes: true, attributeFilter: ['dark', 'data-skek-theme-base'] });

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
