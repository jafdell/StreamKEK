// A button in Twitch's chat box that opens a searchable list of the 7TV, BTTV and FFZ emotes for this
// chat, part of the same setting as emotes.js, which has the lists and calls sync() and tableChanged().
// Clicking an emote is handled by emotes.js, like clicking one in chat. The list is only built while it's
// open, its images load as they scroll into view, and all of it goes away when it closes. The emotes you
// sent last come first, from recent-emotes.js, Twitch's own included.
(() => {
  'use strict';

  // Twitch's pages and its chat in the multi-stream view, but not that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const TWITCH_BUTTON = "[data-a-target='emote-picker-button']";
  const CHAT_BOX_AREA = '.chat-input__textarea';
  const ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2"/><path d="M9 9.5v.5M15 9.5v.5"/></svg>';
  const WIDTH = 340;
  const HEIGHT = 440;
  const EDGE = 8;
  const GAP = 6;

  let button = null;
  let panel = null;

  function createButton() {
    const created = document.createElement('button');
    created.type = 'button';
    created.className = 'skek-picker-button';
    created.setAttribute('aria-label', '7TV, BTTV and FFZ emotes');
    // A constant from this file.
    created.innerHTML = ICON;
    created.addEventListener('click', () => (panel ? closePanel() : openPanel()));
    return created;
  }

  // Twitch's buttons in the box float over its right edge, and how many there are depends on the channel.
  // Going in the same floating box keeps this one to their left, whatever's there.
  function floatingBox(element) {
    for (let node = element; node; node = node.parentElement) {
      if (getComputedStyle(node).position === 'absolute') return node;
    }
    return null;
  }

  function sync() {
    if (!skek.chatEmotes.emotesReady()) {
      closePanel();
      button?.remove();
      return;
    }
    if (button?.isConnected) return;
    const twitchButton = document.querySelector(TWITCH_BUTTON);
    const holder = twitchButton && floatingBox(twitchButton);
    if (!holder) return;
    button ??= createButton();
    holder.prepend(button);
  }

  function tableChanged() {
    closePanel();
    sync();
  }

  function filter(list, query) {
    const lower = query.trim().toLowerCase();
    let anyShown = false;
    for (const section of list.querySelectorAll('.skek-picker__section')) {
      let sectionShown = false;
      for (const image of section.querySelectorAll('img')) {
        image.hidden = !image.alt.toLowerCase().includes(lower);
        if (!image.hidden) sectionShown = true;
      }
      section.hidden = !sectionShown;
      if (sectionShown) anyShown = true;
    }
    list.querySelector('.skek-picker__empty').hidden = anyShown;
  }

  function section(title, images) {
    const created = document.createElement('section');
    created.className = 'skek-picker__section';
    const heading = document.createElement('h3');
    heading.className = 'skek-picker__heading';
    heading.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'skek-picker__grid';
    grid.append(...images);
    created.append(heading, grid);
    return created;
  }

  function buildPanel() {
    const created = document.createElement('div');
    created.className = 'skek-picker';

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'skek-picker__search';
    search.placeholder = 'Search emotes';
    search.setAttribute('aria-label', 'Search emotes');

    const list = document.createElement('div');
    list.className = 'skek-picker__list';
    const recent = skek.recentEmotes.shown();
    const sections = [...(recent.length ? [{ title: 'Recently used', emotes: recent }] : []), ...skek.chatEmotes.pickerSections()];
    for (const { title, emotes } of sections) {
      list.append(section(title, emotes.map((emote) => skek.chatEmotes.emoteImage(emote, true))));
    }
    const empty = document.createElement('p');
    empty.className = 'skek-picker__empty';
    empty.textContent = 'No emotes found';
    empty.hidden = list.children.length > 0;
    list.append(empty);

    search.addEventListener('input', () => filter(list, search.value));
    created.append(search, list);
    return { created, search };
  }

  function openPanel() {
    const { created, search } = buildPanel();
    panel = created;
    const buttonRect = button.getBoundingClientRect();
    const boxTop = (button.closest(CHAT_BOX_AREA) ?? button).getBoundingClientRect().top;
    const width = Math.min(WIDTH, window.innerWidth - EDGE * 2);
    panel.style.width = `${width}px`;
    panel.style.height = `${Math.min(HEIGHT, boxTop - GAP - EDGE)}px`;
    panel.style.bottom = `${window.innerHeight - boxTop + GAP}px`;
    panel.style.left = `${Math.max(EDGE, Math.min(buttonRect.right - width, window.innerWidth - width - EDGE))}px`;
    // In fullscreen, only what's inside the fullscreen element can show.
    (document.fullscreenElement ?? document.body).append(panel);
    search.focus();
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', closePanel);
  }

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', closePanel);
  }

  function onDocumentClick(event) {
    if (!event.target.closest?.('.skek-picker, .skek-picker-button')) closePanel();
  }

  // Captured, so Esc doesn't also leave floating chat or theatre.
  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closePanel();
  }

  skek.emotePicker = { sync, tableChanged };
})();
