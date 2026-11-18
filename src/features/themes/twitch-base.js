// Switches Twitch between its own dark and light theme, for a theme that's built on the other one.
// twitch/page-sync.js says which it should be, as data-skek-twitch-base on <html>. Runs in the page
// itself, because Twitch's theme can only be changed from there without reloading. This changes
// what Twitch shows, not what it has saved as your theme: that's page-sync.js's.
(() => {
  'use strict';

  const root = document.documentElement;
  const TWITCH_THEMES = { light: 0, dark: 1 };

  // Where Twitch keeps what it's showing, which React hands down from the top of the page. Null if
  // Twitch changes how that works, and then its theme stays as it is until the next page.
  function findStore() {
    const container = document.getElementById('root');
    const key = container && Object.keys(container).find((name) => name.startsWith('__reactContainer$'));
    const queue = key ? [container[key]] : [];
    for (let seen = 0; queue.length && seen < 200; seen++) {
      const node = queue.shift();
      const store = node?.pendingProps?.value?.store ?? node?.pendingProps?.store;
      if (typeof store?.dispatch === 'function' && typeof store.getState === 'function') return store;
      if (node?.child) queue.push(node.child);
      if (node?.sibling) queue.push(node.sibling);
    }
    return null;
  }

  function switchTheme() {
    const wanted = TWITCH_THEMES[root.dataset.skekTwitchBase];
    if (wanted === undefined) return;
    try {
      const store = findStore();
      const shown = store?.getState().ui?.theme;
      if ((shown === 0 || shown === 1) && shown !== wanted) store.dispatch({ type: 'core.ui.THEME_CHANGED', theme: wanted });
    } catch {
      // Twitch keeps its own theme.
    }
  }

  // Twitch puts its theme on <html>'s class once it has started, and again when you change it there.
  new MutationObserver(switchTheme).observe(root, { attributes: true, attributeFilter: ['class', 'data-skek-twitch-base'] });
  switchTheme();
})();
