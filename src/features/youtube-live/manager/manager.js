// The channel manager: add and remove channels, and the subscriptions switch.
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

  function say(text, isError) {
    message.hidden = !text;
    message.textContent = text || '';
    message.classList.toggle('error', !!isError);
  }

  function row(channel, live) {
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
    const state = document.createElement('span');
    state.className = live ? 'state live' : 'state';
    state.textContent = live
      ? `Live${live.viewers == null ? '' : ` · ${live.viewers.toLocaleString()} watching`}`
      : 'Offline';
    text.append(name, state);

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Remove ${channel.name}`;
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'youtube-live:remove', id: channel.id }));

    li.append(img, text, remove);
    return li;
  }

  async function render() {
    const {
      channels = [],
      subChannels = {},
      live = {},
      status,
      showSubscriptions = skek.settingDefaults.showSubscriptions,
    } = await chrome.storage.local.get(['channels', 'subChannels', 'live', 'status', 'showSubscriptions']);
    list.replaceChildren(...channels.map((c) => row(c, live[c.id])));
    empty.hidden = channels.length > 0;

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

  const WATCHED_KEYS = ['channels', 'subChannels', 'live', 'status', 'showSubscriptions'];

  chrome.storage.onChanged.addListener((changes, area) => {
    // Other keys (settings, theme) would rebuild the list for nothing.
    if (area === 'local' && WATCHED_KEYS.some((key) => key in changes)) render();
  });
  render();
  chrome.runtime.sendMessage({ type: 'youtube-live:refresh' });
})();
