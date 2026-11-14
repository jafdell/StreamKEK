// Remembers the sort order you pick on Twitch's Browse page, its live channels page and category pages.
// Twitch keeps each of the three only for the tab it was picked in, and sets them all back to
// Recommended For You the first time a new tab shows one of those pages. This keeps your last pick for
// each place and puts it in every tab before Twitch looks, with the mark Twitch leaves once it has done
// that reset, so it doesn't do it.
// The picks are kept in Twitch's own localStorage, not chrome.storage.local, which only answers after
// a wait that Twitch's page could win. So they aren't in a backup, and clearing Twitch's site data
// forgets them, as it does Twitch's own choices. There's no setting, and nothing is added to the page.
// If Twitch renames what it keeps, sorting goes back to how Twitch does it.
(() => {
  'use strict';

  // Twitch's names, in the tab's sessionStorage, for the sort on Browse, on live channels and on a
  // category's page.
  const PLACES = ['browseAllCategoriedPageSort', 'directoryAllChannelPageSort', 'directoryGameChannelPageSort'];
  // Recommended For You, Viewers (High to Low), Viewers (Low to High) and Recently Started.
  const SORTS = ['RELEVANCE', 'VIEWER_COUNT', 'VIEWER_COUNT_ASC', 'RECENT'];

  // Twitch keeps each sort as JSON text.
  function sortFrom(text) {
    try {
      const sort = JSON.parse(text);
      return SORTS.includes(sort) ? sort : null;
    } catch {
      return null;
    }
  }

  // The remembered picks, by place, from the text they're kept as. Anything else in it is dropped.
  function picksFrom(text) {
    const picks = {};
    try {
      const kept = JSON.parse(text);
      for (const place of PLACES) {
        if (SORTS.includes(kept?.[place])) picks[place] = kept[place];
      }
    } catch {
      // Nothing kept yet, or not what this wrote.
    }
    return picks;
  }

  // What to do where this tab's sorts differ from the remembered ones. While you're using the sort
  // menu, the tab's sort is your new pick. Any other time Twitch changed it, on a new tab or on a page
  // that doesn't offer your pick, so the pick is put back for the next page.
  function settle(picks, tab, picking) {
    const remember = { ...picks };
    const putBack = {};
    for (const place of PLACES) {
      const pick = picks[place] ?? null;
      const now = tab[place] ?? null;
      if (now === pick) continue;
      if (picking && now) remember[place] = now;
      else if (pick) putBack[place] = pick;
    }
    return { remember, putBack };
  }

  skek.sortOrder = { sortFrom, picksFrom, settle };

  // The tests have no page, and only need the functions above.
  if (typeof document === 'undefined') return;

  const KEY = 'skek-sort-orders';
  // What Twitch leaves in the tab once it has set every sort back.
  const RESET_DONE = 'browseSortExperimentApplied';
  const MENU = '#browse-sort-drop-down, #browse-sort-drop-down-list';
  // How long after the menu is used a change still counts as your pick.
  const PICKING_MS = 2000;

  let picks;
  let pickingUntil = 0;

  function check() {
    const tab = Object.fromEntries(PLACES.map((place) => [place, sortFrom(sessionStorage.getItem(place))]));
    const { remember, putBack } = settle(picks, tab, Date.now() < pickingUntil);
    if (JSON.stringify(remember) !== JSON.stringify(picks)) {
      picks = remember;
      localStorage.setItem(KEY, JSON.stringify(picks));
    }
    const places = Object.keys(putBack);
    if (!places.length) return;
    sessionStorage.setItem(RESET_DONE, 'true');
    for (const place of places) sessionStorage.setItem(place, JSON.stringify(putBack[place]));
  }

  // Straight away, before Twitch's page starts. With storage blocked for Twitch, it can't keep a sort
  // either, so there's nothing to do.
  try {
    picks = picksFrom(localStorage.getItem(KEY));
    check();
  } catch {
    return;
  }

  // A pick made in another tab.
  addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage || event.key !== KEY) return;
    picks = picksFrom(event.newValue);
    check();
  });

  // Twitch's sort menu, used by mouse or keyboard.
  function onMenuUse(event) {
    if (!event.target.closest?.(MENU)) return;
    pickingUntil = Date.now() + PICKING_MS;
    setTimeout(check, 500);
  }
  document.addEventListener('click', onMenuUse, true);
  document.addEventListener('keydown', onMenuUse, true);

  // Each page Twitch draws can have changed the tab's sorts.
  skek.helpers.onBodyReady(() => skek.helpers.onPageChange(check));
})();
