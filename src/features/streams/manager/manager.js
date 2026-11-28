// The channel manager for one site, named in its address: add and remove channels, the switch for
// your followed channels, and showing hidden channels again.
(() => {
  'use strict';

  const { SETTINGS, settingDefaults, sites } = skek;

  const params = new URLSearchParams(location.search);
  const site = sites[params.get('site')];
  // Inside the settings window, which has the heading and the switch already.
  document.documentElement.toggleAttribute('data-embedded', params.has('embedded'));

  const form = document.getElementById('add');
  const input = document.getElementById('input');
  const submit = document.getElementById('submit');
  const message = document.getElementById('message');
  const problem = document.getElementById('problem');
  const switches = document.getElementById('switches');
  const list = document.getElementById('list');
  const hiddenSection = document.getElementById('hidden');
  const hiddenTitle = document.getElementById('hidden-title');
  const hiddenList = document.getElementById('hidden-list');

  document.getElementById('title').textContent = `${site.name} channels`;
  input.placeholder = site.placeholder;

  const WATCHED_KEYS = [...Object.values(site.keys), site.followsSetting];

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

  // A live channel says so, with how many are watching where the site tells.
  function row(channel, live) {
    let state = null;
    if (live) {
      state = document.createElement('span');
      state.className = 'state';
      state.textContent = live.viewers == null ? 'Live' : live.viewers.toLocaleString();
    }

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Remove ${channel.name}`;
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => chrome.runtime.sendMessage({ type: `${site.messagePrefix}:remove`, id: channel.id }));

    return channelRow(channel, state, remove);
  }

  function hiddenRow(channel) {
    const show = document.createElement('button');
    show.className = 'show';
    show.type = 'button';
    show.textContent = 'Show';
    show.title = `Show ${channel.name} again`;
    show.setAttribute('aria-label', show.title);
    show.addEventListener('click', () => chrome.runtime.sendMessage({ type: `${site.messagePrefix}:unhide`, id: channel.id }));
    return channelRow(channel, null, show);
  }

  // The switch for your followed channels, using the setting's own label and message.
  const setting = SETTINGS.find((s) => s.key === site.followsSetting);
  const toggle = document.createElement('input');
  const switchLabel = document.createElement('label');
  switchLabel.className = 'subs';
  toggle.className = 'skek-switch';
  toggle.type = 'checkbox';
  toggle.setAttribute('role', 'switch');
  // Before storage answers, so a switch that's on doesn't slide on every open.
  toggle.checked = settingDefaults[site.followsSetting];
  toggle.addEventListener('change', () => chrome.runtime.sendMessage({ type: setting.message, enabled: toggle.checked }));
  switchLabel.append(setting.label, toggle);
  switches.append(switchLabel);

  // What stops the site's channels from showing, if anything, and what to do about it.
  function problemText(saved) {
    const status = saved[site.keys.status];
    if (status?.consentRequired) return `${site.name} is showing its cookie prompt. Open ${site.domain} and answer it once.`;
    if (saved[site.followsSetting] === false) return '';
    if (status?.signedOut) return `Sign in to ${site.name} in this browser to see who you follow.`;
    if (status?.failed) return `Couldn't reach ${site.name}.`;
    return '';
  }

  async function render() {
    const saved = await chrome.storage.local.get(WATCHED_KEYS);

    const rows = (saved[site.keys.own] ?? []).map((c) => row(c, saved[site.keys.live]?.[c.id]));
    list.replaceChildren(...rows);

    const hidden = Object.values(saved[site.keys.hidden] ?? {}).sort((a, b) => a.name.localeCompare(b.name));
    hiddenSection.hidden = !hidden.length;
    hiddenTitle.textContent = `Hidden channels (${hidden.length})`;
    hiddenList.replaceChildren(...hidden.map(hiddenRow));

    toggle.checked = saved[site.followsSetting] ?? settingDefaults[site.followsSetting];
    problem.textContent = problemText(saved);
    problem.hidden = !problem.textContent;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    const otherSite = Object.values(sites).find((other) => other !== site && other.linkPattern.test(value));
    if (otherSite) return say(`That's a ${otherSite.name} link. Add it under ${otherSite.name} instead.`, true);

    submit.disabled = true;
    say('Looking up channel…');
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
  chrome.runtime.sendMessage({ type: `${site.messagePrefix}:refresh` });
})();
