// The settings window: categories, search and the settings from src/settings.js.
// Every category is on the one page, each under a heading that stays at the top while its
// settings scroll by. The list on the left scrolls to a category and shows which one you're in.
// One page with two ways in: framed on Twitch by src/twitch/settings-button.js, and as
// the toolbar popup.
(() => {
  'use strict';

  const { SETTINGS, settingDefaults, sites, chatWords, backup, changelog } = skek;

  const REPO = 'https://github.com/jafdell/StreamKEK';
  const WEBSITE = 'https://streamkek.com';
  const VERSION = chrome.runtime.getManifest().version;

  // Things in a category that aren't settings. `build` returns what goes under the label, and
  // `href` makes the whole row a link instead.
  const CUSTOM_ITEMS = [
    ...Object.entries(sites).map(([platform, { name, managerHint }]) => ({
      category: name,
      label: `Your ${name} channels`,
      hint: managerHint,
      build: () => channelManagerFrame(platform, `${name} channels`),
    })),
    {
      category: 'Chat',
      label: 'Blocked words',
      hint: 'Messages with any of these are removed from Twitch, YouTube and Kick chat, name and all. Matches whole words or phrases, in upper or lower case, and emote names. Separate several with commas.',
      build: (saved) => wordList('chatBlockedWords', saved, 'Add a word to block'),
    },
    {
      category: 'Chat',
      label: 'Highlighted words',
      hint: 'Messages with any of these stand out in Twitch, YouTube and Kick chat, with the word itself colored. Matches whole words or phrases, in upper or lower case, and emote names. Separate several with commas.',
      build: (saved) => wordList('chatHighlightedWords', saved, 'Add a word to highlight', 'word-chip--highlight'),
    },
    {
      category: 'Backup',
      label: 'Save a backup',
      hint: 'Saves your settings, channels, favorites and chat words to a file, so you can put them back after reinstalling StreamKEK or moving its folder. No passwords or sign-ins are in it.',
      build: () => backup.saveControl(),
    },
    {
      category: 'Backup',
      label: 'Restore a backup',
      hint: 'Puts back what a backup file saved, replacing what you have now. You can check what it holds before anything changes.',
      build: () => backup.restoreControl(),
    },
    {
      category: 'Feedback',
      label: 'Report a bug',
      hint: 'Something not working? Opens a short form on GitHub, which needs a GitHub account.',
      // The form fills in its version field from the address.
      href: `${REPO}/issues/new?template=bug_report.yml&version=${encodeURIComponent(VERSION)}`,
    },
    {
      category: 'Feedback',
      label: 'Request a feature',
      hint: 'Have an idea? Opens a short form on GitHub, which needs a GitHub account.',
      href: `${REPO}/issues/new?template=feature_request.yml`,
    },
    {
      category: 'Feedback',
      label: 'GitHub page',
      hint: "See StreamKEK's code, releases and what others have reported.",
      href: REPO,
    },
    {
      category: 'Feedback',
      label: 'Website',
      hint: 'What StreamKEK does, help when something is off, and the privacy policy.',
      href: WEBSITE,
    },
  ];

  // Only ever fed into innerHTML from these constants.
  const LINK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h5v2H6v10h10v-4h2v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/></svg>';
  const CATEGORY_ICONS = {
    Backup: '<path d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3 1.4 1.4L12 17.4l-5.7-5.7 1.4-1.4 3.3 3.3V4a1 1 0 0 1 1-1ZM4 19h16v2H4v-2Z"/>',
    Appearance: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2v14a7 7 0 0 1 0-14Z"/>',
    Chat: '<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9.5L5 21v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/>',
    Feedback: '<path d="M3 20.5 22 12 3 3.5V10l12 2-12 2v6.5Z"/>',
    Notifications: '<path d="M12 3a6 6 0 0 0-6 6v4l-2 3v1h16v-1l-2-3V9a6 6 0 0 0-6-6Zm-2 16a2 2 0 0 0 4 0h-4Z"/>',
    Player: '<path d="M8 5v14l11-7L8 5Z"/>',
    "What's new": '<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/>',
    Sidebar: '<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h4V7H5Zm6 0v10h8V7h-8Z"/>',
    Kick: '<path d="M4 3h7v5h2V5h2V3h5v6h-2v2h-2v2h2v2h2v6h-5v-2h-2v-3h-2v5H4V3Z"/>',
    YouTube: '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.7 2 12 2 12s0 3.3.4 4.8c.2.9.9 1.5 1.8 1.8 1.5.4 7.8.4 7.8.4s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.5.4-4.8.4-4.8s0-3.3-.4-4.8ZM10 15V9l5.2 3-5.2 3Z"/>',
  };
  const DEFAULT_CATEGORY_ICON = '<circle cx="12" cy="12" r="4"/>';
  const SITE_CATEGORIES = Object.values(sites).map((site) => site.name);
  const BOTTOM_CATEGORIES = ['Backup', 'Feedback'];
  // Each version's changes, from CHANGELOG.md. It goes after the bottom categories once that's been read.
  const WHATS_NEW = "What's new";
  // How many versions it shows until its button for the rest is pressed.
  const LATEST_VERSIONS = 5;

  const search = document.getElementById('search');
  const categoryLinks = document.getElementById('categories');
  const feedbackLink = document.getElementById('feedback-category');
  const groups = document.getElementById('groups');
  const noResults = document.getElementById('no-results');
  const closeButton = document.getElementById('close');
  const versionLabel = document.getElementById('version');

  const framed = window !== window.top;
  const named = [...new Set([...SETTINGS, ...CUSTOM_ITEMS].map((item) => item.category))].sort((a, b) => a.localeCompare(b));
  // The order of the list and of the page. The other sites sit together under a divider, each
  // group still in alphabetical order. Backup and Feedback sit apart at the bottom, so they aren't
  // mistaken for groups of settings.
  const settingCategories = named.filter((category) => !BOTTOM_CATEGORIES.includes(category) && !SITE_CATEGORIES.includes(category));
  const siteCategories = named.filter((category) => SITE_CATEGORIES.includes(category));
  const categories = [...settingCategories, ...siteCategories, ...BOTTOM_CATEGORIES.filter((category) => named.includes(category))];
  // The toolbar popup opens a tab here to restore a backup.
  const askedCategory = decodeURIComponent(location.hash.slice(1));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // A category counts as reached this far before its heading touches the top: by then it has
  // pushed the heading before it half out, and nearly everything showing belongs to it.
  const REACHED_PX = 28;
  // The category a click in the list is scrolling to, which stays marked on the way there.
  let scrollingTo = null;
  let markQueued = false;

  function searchText(item) {
    const choices = item.choices?.map((choice) => choice.label).join(' ') ?? '';
    return `${item.label} ${item.hint} ${item.category} ${choices}`.toLowerCase();
  }

  function cardText(item) {
    const text = document.createElement('span');
    text.className = 'card__text';
    const label = document.createElement('span');
    label.className = 'card__label';
    label.textContent = item.label;
    const hint = document.createElement('span');
    hint.className = 'card__hint';
    hint.textContent = item.hint;
    text.append(label, hint);
    return text;
  }

  function settingRow(setting, value) {
    if (setting.dropdown) return dropdownRow(setting, value);
    if (setting.swatches) return swatchRow(setting, value);
    return setting.choices ? choiceRow(setting, value) : switchRow(setting, value);
  }

  function dropdownRow(setting, selected) {
    const row = document.createElement('div');
    row.className = 'card setting';
    row.dataset.search = searchText(setting);

    const dropdown = document.createElement('select');
    dropdown.className = 'dropdown__select';
    dropdown.dataset.key = setting.key;
    dropdown.setAttribute('aria-label', setting.label);
    for (const choice of setting.choices) dropdown.add(new Option(choice.label, choice.value));
    dropdown.value = selected;
    dropdown.addEventListener('change', () => chrome.storage.local.set({ [setting.key]: dropdown.value }));

    // The wrapper draws the arrow, because a <select> can't have ::after.
    const wrapper = document.createElement('span');
    wrapper.className = 'dropdown';
    wrapper.append(dropdown);

    row.append(cardText(setting), wrapper);
    return row;
  }

  function choiceRow(setting, selected) {
    const row = document.createElement('div');
    row.className = 'card setting';
    row.dataset.search = searchText(setting);

    const group = document.createElement('div');
    group.className = 'choices';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', setting.label);
    for (const choice of setting.choices) {
      const option = document.createElement('label');
      option.className = 'choice';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = setting.key;
      radio.value = choice.value;
      radio.checked = choice.value === selected;
      radio.addEventListener('change', () => chrome.storage.local.set({ [setting.key]: choice.value }));
      const text = document.createElement('span');
      text.textContent = choice.label;
      option.append(radio, text);
      group.append(option);
    }

    row.append(cardText(setting), group);
    return row;
  }

  // A small picture of a theme: the page with its backdrop, a panel on it, a line of text, a link
  // and a button. It has data-skek-theme, so features/themes/palettes.css gives it that theme's
  // colors.
  function themeScene(theme) {
    const scene = document.createElement('span');
    scene.className = 'swatch__scene';
    scene.dataset.skekTheme = theme;
    const main = document.createElement('span');
    main.className = 'swatch__main';
    for (const part of ['swatch__text', 'swatch__text swatch__text--link', 'swatch__button']) {
      main.append(Object.assign(document.createElement('span'), { className: part }));
    }
    scene.append(Object.assign(document.createElement('span'), { className: 'swatch__panel' }), main);
    return scene;
  }

  // Radio buttons drawn as pictures, under a heading for each group.
  function swatchRow(setting, selected) {
    const row = document.createElement('div');
    row.className = 'card';
    row.dataset.search = searchText(setting);

    const picker = document.createElement('div');
    picker.className = 'swatches';
    picker.setAttribute('role', 'radiogroup');
    picker.setAttribute('aria-label', setting.label);
    for (const group of new Set(setting.choices.map((choice) => choice.group))) {
      const heading = document.createElement('p');
      heading.className = 'swatches__group';
      heading.textContent = group;
      const grid = document.createElement('div');
      grid.className = 'swatches__grid';
      for (const choice of setting.choices.filter((each) => each.group === group)) {
        const option = document.createElement('label');
        option.className = 'swatch';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = setting.key;
        radio.value = choice.value;
        radio.checked = choice.value === selected;
        radio.addEventListener('change', () => chrome.storage.local.set({ [setting.key]: choice.value }));
        const preview = document.createElement('span');
        preview.className = 'swatch__preview';
        preview.append(themeScene(choice.value));
        const name = document.createElement('span');
        name.className = 'swatch__name';
        name.textContent = choice.label;
        option.append(radio, preview, name);
        grid.append(option);
      }
      picker.append(heading, grid);
    }

    row.append(cardText(setting), picker);
    return row;
  }

  function switchRow(setting, on) {
    const row = document.createElement('label');
    row.className = 'card setting';
    row.dataset.search = searchText(setting);

    const toggle = document.createElement('input');
    toggle.className = 'skek-switch';
    toggle.type = 'checkbox';
    toggle.setAttribute('role', 'switch');
    toggle.dataset.key = setting.key;
    toggle.checked = on;
    toggle.addEventListener('change', () => {
      if (setting.message) chrome.runtime.sendMessage({ type: setting.message, enabled: toggle.checked });
      else chrome.storage.local.set({ [setting.key]: toggle.checked });
    });

    row.append(cardText(setting), toggle);
    return row;
  }

  function customCard(item, saved) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.search = searchText(item);
    card.append(cardText(item), item.build(saved));
    return card;
  }

  function linkRow(item) {
    const row = document.createElement('a');
    row.className = 'card setting';
    row.dataset.search = searchText(item);
    row.href = item.href;
    row.target = '_blank';
    row.rel = 'noopener';
    const icon = document.createElement('span');
    icon.className = 'link-icon';
    icon.innerHTML = LINK_ICON;
    row.append(cardText(item), icon);
    return row;
  }

  function itemRow(item, saved) {
    if (item.href) return linkRow(item);
    return item.build ? customCard(item, saved) : settingRow(item, saved[item.key]);
  }

  // A box to type words into, and each saved word as a chip with a button that removes it.
  function wordList(key, saved, placeholder, chipClass = '') {
    let words = saved[key];

    const input = document.createElement('input');
    input.className = 'word-input';
    input.type = 'text';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);
    input.autocomplete = 'off';
    input.spellcheck = false;

    const add = document.createElement('button');
    add.className = 'word-add';
    add.type = 'submit';
    add.textContent = 'Add';
    add.disabled = true;
    input.addEventListener('input', () => {
      add.disabled = !input.value.trim();
    });

    const chips = document.createElement('ul');
    chips.className = 'word-chips';

    function draw() {
      chips.hidden = !words.length;
      chips.replaceChildren(...words.map(chip));
    }

    function save(next) {
      words = next;
      draw();
      chrome.storage.local.set({ [key]: next });
    }

    function chip(word) {
      const item = document.createElement('li');
      item.className = `word-chip ${chipClass}`;
      const text = document.createElement('span');
      text.className = 'word-chip__text';
      text.textContent = word;
      const remove = document.createElement('button');
      remove.className = 'word-chip__remove';
      remove.type = 'button';
      remove.title = `Remove ${word}`;
      remove.setAttribute('aria-label', `Remove ${word}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        save(words.filter((other) => other !== word));
        input.focus();
      });
      item.append(text, remove);
      return item;
    }

    const form = document.createElement('form');
    form.className = 'word-form';
    form.append(input, add);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const next = chatWords.addWords(words, input.value);
      input.value = '';
      add.disabled = true;
      input.focus();
      if (next.length !== words.length) save(next);
    });

    // The settings window can be open as the popup and on Twitch at once.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[key]) return;
      words = changes[key].newValue ?? chatWords.DEFAULTS[key];
      draw();
    });

    const list = document.createElement('div');
    list.className = 'word-list';
    list.append(form, chips);
    draw();
    return list;
  }

  function channelManagerFrame(site, title) {
    const frame = document.createElement('iframe');
    frame.className = 'manager-frame';
    frame.title = title;
    frame.src = chrome.runtime.getURL(`src/features/streams/manager/manager.html?embedded&site=${site}`);
    frame.addEventListener('load', () => {
      // Keys pressed inside a frame never reach this page's listener.
      frame.contentWindow.addEventListener('keydown', closeOnEscape);
      // As tall as the page inside it, which grows and shrinks with its channels. See manager.css.
      // The frame's own observer, because this page's only hears about the first size.
      const { body } = frame.contentDocument;
      new frame.contentWindow.ResizeObserver(() => {
        frame.style.height = `${body.offsetHeight}px`;
      }).observe(body);
    });
    return frame;
  }

  function categoryIcon(category) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd">${CATEGORY_ICONS[category] ?? DEFAULT_CATEGORY_ICON}</svg>`;
  }

  function categorySection(category, rows) {
    const group = document.createElement('section');
    group.className = 'category';
    group.dataset.category = category;
    const heading = document.createElement('h2');
    heading.className = 'category__title';
    heading.innerHTML = categoryIcon(category);
    heading.append(category);
    group.append(heading, ...rows);
    return group;
  }

  function categoryGroup(category, saved) {
    const items = [...SETTINGS, ...CUSTOM_ITEMS]
      .filter((item) => item.category === category)
      .sort((a, b) => a.label.localeCompare(b.label));
    return categorySection(category, items.map((item) => itemRow(item, saved)));
  }

  // One version of CHANGELOG.md: its number, the day it came out and what changed. Built from
  // text, never as HTML, since it comes from a file.
  function versionCard({ version, date, changes }) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.search = `${WHATS_NEW} version ${version} ${changes.join(' ').replaceAll('**', '')}`.toLowerCase();

    const head = document.createElement('div');
    head.className = 'version-card__head';
    const label = document.createElement('span');
    label.className = 'card__label';
    label.textContent = `Version ${version}`;
    head.append(label);
    if (version === VERSION) {
      const yours = document.createElement('span');
      yours.className = 'version-card__yours';
      yours.textContent = 'Installed';
      head.append(yours);
    }
    if (date) {
      const day = document.createElement('time');
      day.className = 'version-card__date';
      day.dateTime = date;
      day.textContent = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      head.append(day);
    }

    const list = document.createElement('ul');
    list.className = 'version-card__changes';
    for (const change of changes) {
      const item = document.createElement('li');
      for (const part of changelog.boldParts(change)) {
        if (part.bold) item.append(Object.assign(document.createElement('strong'), { textContent: part.text }));
        else item.append(part.text);
      }
      list.append(item);
    }
    card.append(head, list);
    return card;
  }

  // What's new: the latest versions, with a button under them for the rest, since the list grows
  // with every version. The older ones are hidden by a class and not `hidden`, which is the
  // search's: searching looks through every version.
  function whatsNewSection(versions) {
    const cards = versions.map(versionCard);
    const section = categorySection(WHATS_NEW, cards);
    const older = cards.slice(LATEST_VERSIONS);
    if (!older.length) return section;

    for (const card of older) card.classList.add('version-card--older');
    section.classList.add('category--latest-only');
    const more = document.createElement('button');
    more.className = 'more-versions';
    more.type = 'button';
    more.textContent = `Show all ${versions.length} versions`;
    more.addEventListener('click', () => {
      section.classList.remove('category--latest-only');
      more.remove();
      // The first one it brought out takes the focus the button had, without moving the page.
      older[0].tabIndex = -1;
      older[0].focus({ preventScroll: true });
    });
    section.append(more);
    return section;
  }

  // The version an update brought, and the one whose What's new has been opened. The background
  // writes the first, in background/whats-new.js, and this window the second.
  const news = { version: null, seen: null };

  // A pill saying New on What's new in the list, from an update until it's been opened.
  function drawNewsMark() {
    const unseen = !!news.version && news.version !== news.seen;
    const link = [...feedbackLink.children].find((each) => each.dataset.category === WHATS_NEW);
    if (!link || link.classList.contains('category-link--news') === unseen) return;
    link.classList.toggle('category-link--news', unseen);
    // Says what the pill, which settings-window.css draws, means.
    link.title = unseen ? 'New since the last update' : '';
  }

  function markNewsSeen() {
    if (!news.version || news.version === news.seen) return;
    news.seen = news.version;
    chrome.storage.local.set({ whatsNewSeen: news.seen });
    drawNewsMark();
  }

  // The version under the list becomes the way to What's new.
  function linkVersionLabel() {
    const link = document.createElement('button');
    link.className = 'version__link';
    link.type = 'button';
    link.title = "See what's new";
    link.textContent = versionLabel.textContent;
    link.addEventListener('click', () => showCategory(WHATS_NEW));
    versionLabel.replaceChildren(link);
  }

  function categoryLink(category) {
    const link = document.createElement('button');
    link.className = 'category-link';
    link.type = 'button';
    link.dataset.category = category;
    link.innerHTML = categoryIcon(category);
    link.append(category);
    link.addEventListener('click', () => showCategory(category));
    return link;
  }

  // The category at the top of the page: the last one whose heading has reached it.
  function categoryInView() {
    let current = null;
    for (const group of groups.children) {
      if (group.hidden) continue;
      if (current && group.offsetTop > groups.scrollTop + REACHED_PX) break;
      current = group;
    }
    return current?.dataset.category ?? null;
  }

  function markCategory() {
    const current = scrollingTo ?? categoryInView();
    for (const link of [...categoryLinks.children, ...feedbackLink.children]) {
      if (!link.dataset.category) continue;
      const isCurrent = link.dataset.category === current;
      if (link.getAttribute('aria-current') === String(isCurrent)) continue;
      link.setAttribute('aria-current', String(isCurrent));
      // The list scrolls too, when the window is short.
      if (isCurrent) link.scrollIntoView({ block: 'nearest' });
    }
    // Clicked, or scrolled to. Not when a search happens to leave it at the top.
    if (current === WHATS_NEW && !search.value) markNewsSeen();
  }

  // Scrolling asks for this far more often than the page is drawn.
  function queueMarkCategory() {
    if (markQueued) return;
    markQueued = true;
    requestAnimationFrame(() => {
      markQueued = false;
      markCategory();
    });
  }

  function scrollToCategory(category, smooth) {
    const group = [...groups.children].find((candidate) => candidate.dataset.category === category);
    if (!group) return;
    const top = Math.min(group.offsetTop, groups.scrollHeight - groups.clientHeight);
    // A scroll that goes nowhere never says it has ended.
    scrollingTo = smooth && Math.abs(groups.scrollTop - top) >= 1 ? category : null;
    groups.scrollTo({ top, behavior: scrollingTo ? 'smooth' : 'instant' });
    markCategory();
  }

  function showCategory(category) {
    if (search.value) {
      search.value = '';
      filterItems();
    }
    scrollToCategory(category, !reducedMotion.matches);
  }

  // While searching, leaves only the items with all the typed words in their label, hint or
  // category, under the headings of the categories they're in.
  function filterItems() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let anyMatch = false;
    for (const group of groups.children) {
      let groupMatches = false;
      for (const item of group.querySelectorAll('[data-search]')) {
        const matches = words.every((word) => item.dataset.search.includes(word));
        item.hidden = !matches;
        groupMatches ||= matches;
      }
      group.hidden = !groupMatches;
      anyMatch ||= groupMatches;
    }
    groups.classList.toggle('groups--searching', words.length > 0);
    groups.hidden = !anyMatch;
    noResults.hidden = anyMatch;
    scrollingTo = null;
    groups.scrollTop = 0;
    markCategory();
  }

  function closeWindow() {
    parent.postMessage({ skekSettings: 'close' }, 'https://www.twitch.tv');
  }

  function closeOnEscape(event) {
    if (!framed || event.key !== 'Escape') return;
    // Escape in the search box clears it first; that's the browser's own behaviour.
    if (event.target !== search || !search.value) closeWindow();
  }

  document.documentElement.classList.toggle('framed', framed);
  versionLabel.textContent = `Version ${VERSION}`;
  search.addEventListener('input', filterItems);
  groups.addEventListener('scroll', queueMarkCategory);
  groups.addEventListener('scrollend', () => {
    scrollingTo = null;
    markCategory();
  });
  closeButton.hidden = !framed;
  closeButton.addEventListener('click', closeWindow);
  addEventListener('keydown', closeOnEscape);

  // A setting can also change elsewhere, like the subscriptions switch in the + frame.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const toggle of groups.querySelectorAll('.skek-switch')) {
      const change = changes[toggle.dataset.key];
      if (change) toggle.checked = change.newValue ?? settingDefaults[toggle.dataset.key];
    }
    for (const radio of groups.querySelectorAll('input[type="radio"]')) {
      const change = changes[radio.name];
      if (change) radio.checked = radio.value === (change.newValue ?? settingDefaults[radio.name]);
    }
    for (const dropdown of groups.querySelectorAll('.dropdown__select')) {
      const change = changes[dropdown.dataset.key];
      if (change) dropdown.value = change.newValue ?? settingDefaults[dropdown.dataset.key];
    }
    // Opened in the other place this window can be, or an update while it's open.
    if (changes.whatsNewVersion) news.version = changes.whatsNewVersion.newValue ?? null;
    if (changes.whatsNewSeen) news.seen = changes.whatsNewSeen.newValue ?? null;
    if (changes.whatsNewVersion || changes.whatsNewSeen) drawNewsMark();
  });

  const NEWS_DEFAULTS = { whatsNewVersion: null, whatsNewSeen: null };
  Promise.all([chrome.storage.local.get({ ...settingDefaults, ...chatWords.DEFAULTS, ...NEWS_DEFAULTS }), changelog.loadChangelog()]).then(([saved, versions]) => {
    const divider = document.createElement('hr');
    divider.className = 'categories__divider';
    categoryLinks.append(...settingCategories.map(categoryLink), divider, ...siteCategories.map(categoryLink));
    // Rows are built with their saved state, so switches don't slide on every open.
    groups.append(...categories.map((category) => categoryGroup(category, saved)));
    feedbackLink.append(...BOTTOM_CATEGORIES.map(categoryLink));
    // What's new comes last, since it grows with every version and would bury what's after it. It
    // isn't there at all without the file.
    if (versions.length) {
      groups.append(whatsNewSection(versions));
      categories.push(WHATS_NEW);
      feedbackLink.append(categoryLink(WHATS_NEW));
      linkVersionLabel();
      news.version = saved.whatsNewVersion;
      news.seen = saved.whatsNewSeen;
      drawNewsMark();
    }
    filterItems();
    if (categories.includes(askedCategory)) scrollToCategory(askedCategory, false);
  });
})();
