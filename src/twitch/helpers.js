// Small DOM helpers shared by every feature on Twitch pages.
(() => {
  'use strict';

  const ICONS = {
    plus: '<path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6Z"/>',
    external: '<path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h5v2H6v10h10v-4h2v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/>',
    collapse: '<path d="M4 11h10.6l-3.3-3.3 1.4-1.4 5.7 5.7-5.7 5.7-1.4-1.4 3.3-3.3H4v-2Zm15-6h2v14h-2V5Z"/>',
    expand: '<path d="M20 11H9.4l3.3-3.3-1.4-1.4L5.6 12l5.7 5.7 1.4-1.4L9.4 13H20v-2ZM3 5h2v14H3V5Z"/>',
    theatre: '<path fill-rule="evenodd" d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h11V7H4Zm13 0v10h3V7h-3Z"/>',
    stacked: '<path fill-rule="evenodd" d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v9h16V5H4Zm0 11v3h16v-3H4Z"/>',
    floating: '<path fill-rule="evenodd" d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h16V7H4Zm9 2h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z"/>',
    headphones: '<path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1a7 7 0 0 1 14 0v1h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9Z"/>',
    person: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6H5Z"/>',
    clock: '<path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm-1 2v5l4 2 .9-1.8-2.9-1.4V8h-2Z"/>',
    hide: '<path d="M4.7 3.3 3.3 4.7l3 3A11 11 0 0 0 2 12c1.7 3.6 5.4 6 10 6 1.5 0 2.9-.3 4.2-.8l3.1 3.1 1.4-1.4-16-16ZM12 16c-3.3 0-6.1-1.6-7.7-4 .7-1.2 1.7-2.2 3.4-2.9l1.7 1.7a3 3 0 0 0 3.8 3.8l1.5 1.5c-.8.2-1.7.4-2.7.4Zm0-10c-1 0-2 .1-2.9.4l1.7 1.7c.4-.1.8-.1 1.2-.1 3.3 0 6.1 1.6 7.7 4-.4.7-1 1.3-1.6 1.9l1.4 1.4c1-.9 1.8-2 2.5-3.3-1.7-3.6-5.4-6-10-6Z"/>',
    close: '<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/>',
    chat: '<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/>',
    speakerOff: '<path d="M4 9v6h4l5 4V5L8 9H4Zm11.4.6 1.6 1.6 1.6-1.6 1.4 1.4-1.6 1.6 1.6 1.6-1.4 1.4-1.6-1.6-1.6 1.6-1.4-1.4 1.6-1.6-1.6-1.6 1.4-1.4Z"/>',
    // Animated by multi-view.css, and still where motion is reduced.
    soundBars: '<rect class="skek-sound-bar" x="3" y="10" width="3" height="10" rx="1.5"/><rect class="skek-sound-bar" x="8" y="4" width="3" height="16" rx="1.5"/><rect class="skek-sound-bar" x="13" y="13" width="3" height="7" rx="1.5"/><rect class="skek-sound-bar" x="18" y="7" width="3" height="13" rx="1.5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    starOutline: '<path fill-rule="evenodd" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Zm0 4.5-1.5 3-3.3.5 2.4 2.3-.6 3.3 3-1.6 3 1.6-.6-3.3 2.4-2.3-3.3-.5-1.5-3Z"/>',
    twitch: '<path d="M6 2 3 6v13h4v3h3l3-3h3l5-5V2H6Zm13 11-3 3h-4l-2.5 2.5V16H7V4h12v9Zm-3-6h-2v5h2V7Zm-5 0H9v5h2V7Z"/>',
    kick: '<path d="M4 3h7v5h2V5h2V3h5v6h-2v2h-2v2h2v2h2v6h-5v-2h-2v-3h-2v5H4V3Z"/>',
    youtube: '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.7 2 12 2 12s0 3.3.4 4.8c.2.9.9 1.5 1.8 1.8 1.5.4 7.8.4 7.8.4s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.5.4-4.8.4-4.8s0-3.3-.4-4.8ZM10 15V9l5.2 3-5.2 3Z"/>',
  };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'on') for (const [type, fn] of Object.entries(value)) node.addEventListener(type, fn);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    node.append(...children.filter((c) => c != null));
    return node;
  }

  function icon(name) {
    const span = el('span', { class: 'skek-icon' });
    // Only ever fed from the constant ICONS table above.
    span.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">${ICONS[name]}</svg>`;
    return span;
  }

  // The extension's Theme setting, which page-sync.js keeps on <html>. Not Twitch's own theme.
  function theme() {
    return document.documentElement.dataset.skekTheme ?? skek.settingDefaults.theme;
  }

  function send(message) {
    return chrome.runtime.sendMessage(message).catch(() => null);
  }

  // Ctrl, cmd, shift and middle clicks keep their normal link behaviour.
  function isPlainClick(event) {
    return !(event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0);
  }

  // Scripts run at document_start, before <body> exists.
  function onBodyReady(fn) {
    if (document.body) fn();
    else addEventListener('DOMContentLoaded', fn, { once: true });
  }

  const pageChangeListeners = [];

  function runPageChangeListeners() {
    for (const listener of pageChangeListeners) {
      // One feature failing shouldn't stop the others.
      try {
        listener();
      } catch (e) {
        console.error('StreamKEK:', e);
      }
    }
  }

  // Twitch re-renders parts of the page and swaps pages without reloading, so anything
  // added to its page has to be checked again. Needs <body>; runs fn at most every 200ms.
  // Every feature shares one observer, because this fires for each chat message.
  function onPageChange(fn) {
    pageChangeListeners.push(fn);
    if (pageChangeListeners.length > 1) return;
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        runPageChangeListeners();
      }, 200);
    }).observe(document.body, { childList: true, subtree: true });
  }

  skek.helpers = { el, icon, theme, send, isPlainClick, onBodyReady, onPageChange };
})();
