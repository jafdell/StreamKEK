// The settings window: categories, search and the settings from src/settings.js.
// One page with two ways in: framed on Twitch by src/twitch/settings-button.js, and as
// the toolbar popup.
(() => {
  'use strict';

  const { SETTINGS, settingDefaults } = skek;

  const REPO = 'https://github.com/jafdell/StreamKEK';
  const VERSION = chrome.runtime.getManifest().version;

  // Things in a category that aren't settings. `build` returns what goes under the label, and
  // `href` makes the whole row a link instead.
  const CUSTOM_ITEMS = [
    {
      category: 'YouTube',
      label: 'YouTube channels',
      hint: 'Add or remove channels by @handle, channel link or video link.',
      build: channelManagerFrame,
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
  ];

  // Only ever fed into innerHTML from these constants.
  const LINK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h5v2H6v10h10v-4h2v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/></svg>';
  const CATEGORY_ICONS = {
    Appearance: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2v14a7 7 0 0 1 0-14Z"/>',
    Chat: '<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9.5L5 21v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/>',
    Feedback: '<path d="M3 20.5 22 12 3 3.5V10l12 2-12 2v6.5Z"/>',
    Player: '<path d="M8 5v14l11-7L8 5Z"/>',
    Sidebar: '<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v10h4V7H5Zm6 0v10h8V7h-8Z"/>',
    YouTube: '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.7 2 12 2 12s0 3.3.4 4.8c.2.9.9 1.5 1.8 1.8 1.5.4 7.8.4 7.8.4s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.5.4-4.8.4-4.8s0-3.3-.4-4.8ZM10 15V9l5.2 3-5.2 3Z"/>',
  };
  const DEFAULT_CATEGORY_ICON = '<circle cx="12" cy="12" r="4"/>';

  const search = document.getElementById('search');
  const categoryLinks = document.getElementById('categories');
  const feedbackLink = document.getElementById('feedback-category');
  const title = document.getElementById('title');
  const groups = document.getElementById('groups');
  const noResults = document.getElementById('no-results');
  const closeButton = document.getElementById('close');

  const framed = window !== window.top;
  const categories = [...new Set([...SETTINGS, ...CUSTOM_ITEMS].map((item) => item.category))].sort((a, b) => a.localeCompare(b));
  let selectedCategory = categories[0];

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

  function customCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.search = searchText(item);
    card.append(cardText(item), item.build());
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
    return item.build ? customCard(item) : settingRow(item, saved[item.key]);
  }

  function channelManagerFrame() {
    const frame = document.createElement('iframe');
    frame.className = 'manager-frame';
    frame.title = 'YouTube channels';
    frame.src = chrome.runtime.getURL('src/features/youtube-live/manager/manager.html?embedded');
    // Keys pressed inside a frame never reach this page's listener.
    frame.addEventListener('load', () => frame.contentWindow.addEventListener('keydown', closeOnEscape));
    return frame;
  }

  function categoryGroup(category, saved) {
    const group = document.createElement('section');
    group.dataset.category = category;
    const heading = document.createElement('h2');
    heading.className = 'category__title';
    heading.textContent = category;
    const items = [...SETTINGS, ...CUSTOM_ITEMS]
      .filter((item) => item.category === category)
      .sort((a, b) => a.label.localeCompare(b.label));
    group.append(heading, ...items.map((item) => itemRow(item, saved)));
    return group;
  }

  function categoryLink(category) {
    const link = document.createElement('button');
    link.className = 'category-link';
    link.type = 'button';
    link.dataset.category = category;
    link.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd">${CATEGORY_ICONS[category] ?? DEFAULT_CATEGORY_ICON}</svg>`;
    link.append(category);
    link.addEventListener('click', () => {
      selectedCategory = category;
      search.value = '';
      render();
    });
    return link;
  }

  // Shows the selected category. While searching, shows every item with all the typed
  // words in its label, hint or category, whichever category it's in.
  function render() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const searching = words.length > 0;
    let anyMatch = false;
    for (const group of groups.children) {
      let groupMatches = false;
      for (const item of group.querySelectorAll('[data-search]')) {
        const matches = words.every((word) => item.dataset.search.includes(word));
        item.hidden = !matches;
        groupMatches ||= matches;
      }
      group.hidden = searching ? !groupMatches : group.dataset.category !== selectedCategory;
      anyMatch ||= groupMatches;
    }
    groups.classList.toggle('groups--searching', searching);
    groups.hidden = !anyMatch;
    noResults.hidden = anyMatch;
    title.textContent = searching ? 'Search results' : selectedCategory;
    for (const link of [...categoryLinks.children, ...feedbackLink.children]) {
      link.setAttribute('aria-current', String(!searching && link.dataset.category === selectedCategory));
    }
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
  document.getElementById('version').textContent = `Version ${VERSION}`;
  search.addEventListener('input', render);
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
  });

  chrome.storage.local.get(settingDefaults).then((saved) => {
    // Feedback sits apart at the bottom, so it isn't mistaken for a group of settings.
    categoryLinks.append(...categories.filter((category) => category !== 'Feedback').map(categoryLink));
    feedbackLink.append(categoryLink('Feedback'));
    // Rows are built with their saved state, so switches don't slide on every open.
    groups.append(...categories.map((category) => categoryGroup(category, saved)));
    render();
  });
})();
