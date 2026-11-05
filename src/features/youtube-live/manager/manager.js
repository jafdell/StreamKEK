// The channel manager: add and remove channels, the subscriptions switch, and showing
// hidden subscriptions again.
(() => {
  'use strict';

  // Inside the settings window, which has the heading and subscriptions switch already.
  const embedded = new URLSearchParams(location.search).has('embedded');
  document.documentElement.toggleAttribute('data-embedded', embedded);

  const form = document.getElementById('add');
  const input = document.getElementById('input');
  const submit = document.getElementById('submit');
  const message = document.getElementById('message');
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const subsToggle = document.getElementById('subs-toggle');
  const subsState = document.getElementById('subs-state');
  const hiddenSection = document.getElementById('hidden');
  const hiddenTitle = document.getElementById('hidden-title');
  const hiddenList = document.getElementById('hidden-list');

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
    remove.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'youtube-live:remove', id: channel.id }));

    return channelRow(channel, state, remove);
  }

  function hiddenRow(channel) {
    const show = document.createElement('button');
    show.className = 'show';
    show.type = 'button';
    show.textContent = 'Show';
    show.title = `Show ${channel.name} again`;
    show.setAttribute('aria-label', show.title);
    show.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'youtube-live:unhide', id: channel.id }));
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
    } = await chrome.storage.local.get(['channels', 'subChannels', 'live', 'status', 'showSubscriptions', 'hiddenChannels']);
    list.replaceChildren(...channels.map((c) => row(c, live[c.id])));
    empty.hidden = channels.length > 0;

    const hidden = Object.values(hiddenChannels).sort((a, b) => a.name.localeCompare(b.name));
    hiddenSection.hidden = !hidden.length;
    hiddenTitle.textContent = `Hidden subscriptions (${hidden.length})`;
    hiddenList.replaceChildren(...hidden.map(hiddenRow));

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
    const result = await chrome.runtime.sendMessage({ type: 'youtube-live:add', input: value });
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

  const WATCHED_KEYS = ['channels', 'subChannels', 'live', 'status', 'showSubscriptions', 'hiddenChannels'];

  chrome.storage.onChanged.addListener((changes, area) => {
    // Other keys (settings, theme) would rebuild the list for nothing.
    if (area === 'local' && WATCHED_KEYS.some((key) => key in changes)) render();
  });
  render();
  chrome.runtime.sendMessage({ type: 'youtube-live:refresh' });
})();
