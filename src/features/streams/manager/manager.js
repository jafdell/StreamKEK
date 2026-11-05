// The channel manager, for every site: add and remove channels, the switches for your followed
// channels, and showing hidden channels again.
(() => {
  'use strict';

  const { SETTINGS, settingDefaults, sites, siteOf } = skek;

  // Inside the settings window, which has the heading and the switches already.
  const params = new URLSearchParams(location.search);
  document.documentElement.toggleAttribute('data-embedded', params.has('embedded'));
  // Each of the settings window's tabs shows one site. The sidebar's + button shows them all.
  const onlySite = sites[params.get('site')];
  const shownSites = onlySite ? [onlySite] : Object.values(sites);

  const form = document.getElementById('add');
  const input = document.getElementById('input');
  if (onlySite) input.placeholder = onlySite.placeholder;
  const submit = document.getElementById('submit');
  const message = document.getElementById('message');
  const switches = document.getElementById('switches');
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const hiddenSection = document.getElementById('hidden');
  const hiddenTitle = document.getElementById('hidden-title');
  const hiddenList = document.getElementById('hidden-list');

  const allSites = Object.values(sites);
  const WATCHED_KEYS = allSites.flatMap(({ keys, followsSetting }) => [...Object.values(keys), followsSetting]);

  function say(text, isError) {
    message.hidden = !text;
    message.textContent = text || '';
    message.classList.toggle('error', !!isError);
  }

  function channelRow(channel, details, action) {
    const li = document.createElement('li');

    const img = document.createElement('img');
    img.src = channel.avatar || '';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';

    const text = document.createElement('div');
    text.className = 'text';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = channel.name;
    text.append(name);
    if (details) text.append(details);

    li.append(img, text, action);
    return li;
  }

  function row(channel, live) {
    const state = document.createElement('span');
    state.className = live ? 'state live' : 'state';
    state.textContent = live
      ? `Live${live.viewers == null ? '' : ` · ${live.viewers.toLocaleString()} watching`}`
      : 'Offline';

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Remove ${channel.name}`;
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => chrome.runtime.sendMessage({ type: `${siteOf(channel).messagePrefix}:remove`, id: channel.id }));

    return channelRow(channel, state, remove);
  }

  function hiddenRow(channel) {
    const show = document.createElement('button');
    show.className = 'show';
    show.type = 'button';
    show.textContent = 'Show';
    show.title = `Show ${channel.name} again`;
    show.setAttribute('aria-label', show.title);
    show.addEventListener('click', () => chrome.runtime.sendMessage({ type: `${siteOf(channel).messagePrefix}:unhide`, id: channel.id }));
    return channelRow(channel, null, show);
  }

  // One switch per site, using the setting's own label and message.
  const switchParts = new Map(
    allSites.map((site) => {
      const setting = SETTINGS.find((s) => s.key === site.followsSetting);
      const label = document.createElement('label');
      label.className = 'subs';
      const text = document.createElement('span');
      const title = document.createElement('span');
      title.className = 'subs-title';
      title.textContent = setting.label;
      const stateText = document.createElement('span');
      stateText.className = 'state';
      text.append(title, stateText);
      const toggle = document.createElement('input');
      toggle.className = 'skek-switch';
      toggle.type = 'checkbox';
      toggle.setAttribute('role', 'switch');
      toggle.addEventListener('change', () => chrome.runtime.sendMessage({ type: setting.message, enabled: toggle.checked }));
      label.append(text, toggle);
      switches.append(label);
      return [site, { toggle, stateText }];
    }),
  );

  function followsState(site, saved) {
    const status = saved[site.keys.status];
    if (saved[site.followsSetting] === false) return 'Off';
    if (status?.signedOut) return `Sign in to ${site.name} in this browser to use this`;
    if (status?.failed) return `Couldn't reach ${site.name}. Trying again every minute`;
    const followed = saved[site.keys.followed] ?? {};
    const live = saved[site.keys.live] ?? {};
    return `${Object.keys(followed).filter((id) => live[id]).length} live right now`;
  }

  async function render() {
    const saved = await chrome.storage.local.get(WATCHED_KEYS);

    const rows = shownSites.flatMap((site) => (saved[site.keys.own] ?? []).map((c) => row(c, saved[site.keys.live]?.[c.id])));
    list.replaceChildren(...rows);
    empty.hidden = rows.length > 0;

    const hidden = shownSites
      .flatMap((site) => Object.values(saved[site.keys.hidden] ?? {}))
      .sort((a, b) => a.name.localeCompare(b.name));
    hiddenSection.hidden = !hidden.length;
    hiddenTitle.textContent = `Hidden channels (${hidden.length})`;
    hiddenList.replaceChildren(...hidden.map(hiddenRow));

    for (const site of allSites) {
      const { toggle, stateText } = switchParts.get(site);
      toggle.checked = saved[site.followsSetting] ?? settingDefaults[site.followsSetting];
      stateText.textContent = followsState(site, saved);
      if (saved[site.keys.status]?.consentRequired) {
        say(`${site.name} is showing its cookie prompt. Open ${site.domain} and answer it once.`, true);
      }
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    submit.disabled = true;
    say('Looking up channel…');
    const site = onlySite ?? allSites.find(({ linkPattern }) => linkPattern?.test(value)) ?? sites.youtube;
    const result = await chrome.runtime.sendMessage({ type: `${site.messagePrefix}:add`, input: value });
    submit.disabled = false;

    if (result?.ok) {
      input.value = '';
      say(`Added ${result.channel.name}.`);
    } else {
      say(result?.error || 'Could not add that channel.', true);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    // Other keys (settings, theme) would rebuild the list for nothing.
    if (area === 'local' && WATCHED_KEYS.some((key) => key in changes)) render();
  });
  render();
  for (const { messagePrefix } of allSites) chrome.runtime.sendMessage({ type: `${messagePrefix}:refresh` });
})();
