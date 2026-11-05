// The channel manager, for YouTube and Kick: add and remove channels, the subscriptions and
// follows switches, and showing hidden channels again.
(() => {
  'use strict';

  // A channel's messages go to whichever feature's background owns it.
  const messagePrefix = (channel) => (channel.platform === 'kick' ? 'kick-live' : 'youtube-live');
  const isKickLink = (value) => /^(https?:\/\/)?([\w-]+\.)?kick\.com\//i.test(value);

  // Inside the settings window, which has the heading and the switches already.
  const params = new URLSearchParams(location.search);
  document.documentElement.toggleAttribute('data-embedded', params.has('embedded'));
  // Each of the settings window's tabs shows one site. The sidebar's + button shows both.
  const site = params.get('site');
  const PLACEHOLDERS = { youtube: '@handle or channel link', kick: 'Channel name or link' };

  const form = document.getElementById('add');
  const input = document.getElementById('input');
  if (site) input.placeholder = PLACEHOLDERS[site];
  const submit = document.getElementById('submit');
  const message = document.getElementById('message');
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const subsToggle = document.getElementById('subs-toggle');
  const subsState = document.getElementById('subs-state');
  const kickToggle = document.getElementById('kick-toggle');
  const kickState = document.getElementById('kick-state');
  const hiddenSection = document.getElementById('hidden');
  const hiddenTitle = document.getElementById('hidden-title');
  const hiddenList = document.getElementById('hidden-list');

  const WATCHED_KEYS = [
    'channels',
    'subChannels',
    'live',
    'status',
    'showSubscriptions',
    'hiddenChannels',
    'kickChannels',
    'kickFollowed',
    'kickLive',
    'kickStatus',
    'kickHidden',
    'showKickFollows',
  ];

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
    remove.addEventListener('click', () => chrome.runtime.sendMessage({ type: `${messagePrefix(channel)}:remove`, id: channel.id }));

    return channelRow(channel, state, remove);
  }

  function hiddenRow(channel) {
    const show = document.createElement('button');
    show.className = 'show';
    show.type = 'button';
    show.textContent = 'Show';
    show.title = `Show ${channel.name} again`;
    show.setAttribute('aria-label', show.title);
    show.addEventListener('click', () => chrome.runtime.sendMessage({ type: `${messagePrefix(channel)}:unhide`, id: channel.id }));
    return channelRow(channel, null, show);
  }

  async function render() {
    const {
      channels = [],
      subChannels = {},
      live = {},
      status,
      showSubscriptions = skek.settingDefaults.showSubscriptions,
      hiddenChannels = {},
      kickChannels = [],
      kickFollowed = {},
      kickLive = {},
      kickStatus,
      kickHidden = {},
      showKickFollows = skek.settingDefaults.showKickFollows,
    } = await chrome.storage.local.get(WATCHED_KEYS);
    const allLive = { ...live, ...kickLive };
    const own = [...(site === 'kick' ? [] : channels), ...(site === 'youtube' ? [] : kickChannels)];
    list.replaceChildren(...own.map((c) => row(c, allLive[c.id])));
    empty.hidden = own.length > 0;

    const hidden = [
      ...(site === 'kick' ? [] : Object.values(hiddenChannels)),
      ...(site === 'youtube' ? [] : Object.values(kickHidden)),
    ].sort((a, b) => a.name.localeCompare(b.name));
    hiddenSection.hidden = !hidden.length;
    hiddenTitle.textContent = `Hidden channels (${hidden.length})`;
    hiddenList.replaceChildren(...hidden.map(hiddenRow));

    kickToggle.checked = showKickFollows;
    const liveFollows = Object.keys(kickFollowed).filter((id) => kickLive[id]).length;
    kickState.textContent = !showKickFollows
      ? 'Off'
      : kickStatus?.signedOut
        ? 'Sign in to Kick in this browser to use this'
        : kickStatus?.failed
          ? "Couldn't reach Kick. Trying again every minute"
          : `${liveFollows} live right now`;

    subsToggle.checked = showSubscriptions;
    const liveSubs = Object.keys(subChannels).filter((id) => live[id]).length;
    subsState.textContent = !showSubscriptions
      ? 'Off'
      : status?.signedOut
        ? 'Sign in to YouTube in this browser to use this'
        : `${liveSubs} live right now`;
    if (status?.consentRequired) say('YouTube is showing its cookie prompt. Open youtube.com and answer it once.', true);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    submit.disabled = true;
    say('Looking up channel…');
    const toKick = site ? site === 'kick' : isKickLink(value);
    const type = toKick ? 'kick-live:add' : 'youtube-live:add';
    const result = await chrome.runtime.sendMessage({ type, input: value });
    submit.disabled = false;

    if (result?.ok) {
      input.value = '';
      say(`Added ${result.channel.name}.`);
    } else {
      say(result?.error || 'Could not add that channel.', true);
    }
  });

  subsToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'youtube-live:showSubscriptions', enabled: subsToggle.checked });
  });
  kickToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'kick-live:showFollows', enabled: kickToggle.checked });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    // Other keys (settings, theme) would rebuild the list for nothing.
    if (area === 'local' && WATCHED_KEYS.some((key) => key in changes)) render();
  });
  render();
  chrome.runtime.sendMessage({ type: 'youtube-live:refresh' });
  chrome.runtime.sendMessage({ type: 'kick-live:refresh' });
})();
