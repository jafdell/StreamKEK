// Saving your settings, channels, favorites and word lists to a file, and putting them back from one, so a
// reinstall or a moved folder doesn't lose them. A file can come from anywhere, so everything in it is
// checked and only what's known and valid is kept. A restore writes keys that other parts of the extension
// normally write, which is fine for something this rare: the channels check right after it, like the one
// already due, works from what's saved. Everything here runs in the settings window.
(() => {
  'use strict';

  const { SETTINGS, settingDefaults, sites } = skek;

  const APP = 'StreamKEK';
  const BACKUP_VERSION = 1;
  const MAX_FILE_LENGTH = 5_000_000;
  const MAX_ITEMS = 5_000;
  const MAX_TEXT = 300;

  // What a backup holds, with the value to save when it's never been changed, so that restoring a backup
  // really does put things back as they were. A new storage key goes here, or in the list below it if it's
  // only temporary. A test checks that CONTRIBUTING.md's table of keys is covered.
  const KEY_DEFAULTS = {
    ...settingDefaults,
    channels: [],
    subChannels: {},
    hiddenChannels: {},
    kickChannels: [],
    kickFollowed: {},
    kickHidden: {},
    kickVolume: 1,
    favoriteChannels: [],
    chatHidden: false,
    chatBlockedWords: [],
    chatHighlightedWords: [],
    floatingChat: {},
  };
  // Worked out again by the next check.
  const NOT_BACKED_UP = ['live', 'status', 'kickLive', 'kickStatus', 'liveNotificationsSeen'];

  const CHANNEL_ID = /^[\w:@-][\w:.@-]*$/;
  const CHANNEL_NAME = /^[\w-]+$/;
  const HANDLE = /^@?[^\s/\\?#<>"']+$/;

  const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
  const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT;

  function isHttps(value) {
    try {
      return isText(value) && new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Keeps only the fields channels have, each in a form that's safe to build an address or an image from.
  function cleanChannel(value) {
    if (!isObject(value) || !isText(value.id) || !CHANNEL_ID.test(value.id) || !isText(value.name)) return null;
    const channel = { id: value.id, name: value.name };
    if (isText(value.handle) && HANDLE.test(value.handle)) channel.handle = value.handle;
    if (isText(value.platform) && CHANNEL_NAME.test(value.platform)) channel.platform = value.platform;
    if (isText(value.slug) && CHANNEL_NAME.test(value.slug)) channel.slug = value.slug;
    if (isText(value.login) && CHANNEL_NAME.test(value.login)) channel.login = value.login;
    if (isHttps(value.avatar)) channel.avatar = value.avatar;
    return channel;
  }

  function cleanChannelList(value) {
    if (!Array.isArray(value)) return undefined;
    return value.slice(0, MAX_ITEMS).map(cleanChannel).filter(Boolean);
  }

  function cleanChannelMap(value) {
    if (!isObject(value)) return undefined;
    const channels = Object.values(value).slice(0, MAX_ITEMS).map(cleanChannel).filter(Boolean);
    return Object.fromEntries(channels.map((channel) => [channel.id, channel]));
  }

  function cleanWords(value) {
    if (!Array.isArray(value)) return undefined;
    return value.slice(0, MAX_ITEMS).filter(isText);
  }

  function cleanFloatingChat(value) {
    if (!isObject(value)) return undefined;
    const kept = ['x', 'y', 'width', 'height', 'opacity'].filter((key) => Number.isFinite(value[key]));
    return Object.fromEntries(kept.map((key) => [key, value[key]]));
  }

  const cleanBoolean = (value) => (typeof value === 'boolean' ? value : undefined);

  const CLEANERS = {
    ...Object.fromEntries(SETTINGS.map((setting) => [
      setting.key,
      setting.choices
        ? (value) => (setting.choices.some((choice) => choice.value === value) ? value : undefined)
        : cleanBoolean,
    ])),
    channels: cleanChannelList,
    kickChannels: cleanChannelList,
    favoriteChannels: cleanChannelList,
    subChannels: cleanChannelMap,
    hiddenChannels: cleanChannelMap,
    kickFollowed: cleanChannelMap,
    kickHidden: cleanChannelMap,
    chatBlockedWords: cleanWords,
    chatHighlightedWords: cleanWords,
    chatHidden: cleanBoolean,
    floatingChat: cleanFloatingChat,
    kickVolume: (value) => (Number.isFinite(value) && value > 0 && value <= 1 ? value : undefined),
  };

  function createBackup(saved, extensionVersion, now) {
    const data = Object.fromEntries(Object.keys(KEY_DEFAULTS).map((key) => [key, saved[key] ?? KEY_DEFAULTS[key]]));
    return { app: APP, backupVersion: BACKUP_VERSION, extensionVersion, exportedAt: now.toISOString(), data };
  }

  // What's in a backup file and safe to restore. Throws an error whose message is meant for the person.
  function parseBackup(text) {
    if (text.length > MAX_FILE_LENGTH) throw new Error("That file is too big to be a StreamKEK backup.");
    let backup;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error("That file isn't a StreamKEK backup.");
    }
    if (backup?.app !== APP || !isObject(backup.data)) throw new Error("That file isn't a StreamKEK backup.");
    if (!Number.isInteger(backup.backupVersion) || backup.backupVersion > BACKUP_VERSION) {
      throw new Error('That backup comes from a newer StreamKEK. Update StreamKEK first.');
    }
    const data = {};
    for (const [key, clean] of Object.entries(CLEANERS)) {
      const cleaned = Object.hasOwn(backup.data, key) ? clean(backup.data[key]) : undefined;
      if (cleaned !== undefined) data[key] = cleaned;
    }
    if (!Object.keys(data).length) throw new Error('That backup has nothing in it to restore.');
    return { data, exportedAt: backup.exportedAt };
  }

  function plural(count, one, many = `${one}s`) {
    return `${count} ${count === 1 ? one : many}`;
  }

  // What restoring a backup would bring back, in words.
  function describeBackup(data) {
    const channels = (data.channels?.length ?? 0) + (data.kickChannels?.length ?? 0);
    const hidden = Object.keys(data.hiddenChannels ?? {}).length + Object.keys(data.kickHidden ?? {}).length;
    const words = (data.chatBlockedWords?.length ?? 0) + (data.chatHighlightedWords?.length ?? 0);
    return [
      plural(channels, 'added channel'),
      plural(data.favoriteChannels?.length ?? 0, 'favorite'),
      plural(hidden, 'hidden channel'),
      plural(words, 'chat word'),
      'your settings',
    ].join(', ');
  }

  function saveControl() {
    const button = document.createElement('button');
    button.className = 'backup-button';
    button.type = 'button';
    button.textContent = 'Save backup';
    button.addEventListener('click', async () => {
      const saved = await chrome.storage.local.get(KEY_DEFAULTS);
      const now = new Date();
      const backup = createBackup(saved, chrome.runtime.getManifest().version, now);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      link.download = `streamkek-backup-${now.toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    });
    const controls = document.createElement('div');
    controls.className = 'backup-controls';
    controls.append(button);
    return controls;
  }

  function checkAllChannels() {
    for (const { messagePrefix } of Object.values(sites)) {
      chrome.runtime.sendMessage({ type: `${messagePrefix}:refresh`, force: true }).catch(() => {});
    }
  }

  function restoreControl() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;

    const choose = document.createElement('button');
    choose.className = 'backup-button';
    choose.type = 'button';
    choose.textContent = 'Choose file';

    const restore = document.createElement('button');
    restore.className = 'backup-button';
    restore.type = 'button';
    restore.textContent = 'Restore';
    restore.hidden = true;

    const cancel = document.createElement('button');
    cancel.className = 'backup-button backup-button--quiet';
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.hidden = true;

    const message = document.createElement('p');
    message.className = 'backup-message';
    message.hidden = true;

    let pending = null;

    function show(text, kind = '') {
      message.textContent = text;
      message.hidden = !text;
      message.className = `backup-message ${kind}`;
    }

    function setPending(next) {
      pending = next;
      choose.hidden = !!next;
      restore.hidden = !next;
      cancel.hidden = !next;
      input.value = '';
    }

    choose.addEventListener('click', () => {
      // A file dialog closes the toolbar popup, and this page with it, so restoring happens in a tab.
      if (chrome.extension.getViews({ type: 'popup' }).includes(window)) {
        chrome.tabs.create({ url: `${chrome.runtime.getURL('src/settings-window/settings-window.html')}#Backup` });
        return;
      }
      input.click();
    });

    input.addEventListener('change', async () => {
      const [file] = input.files;
      if (!file) return;
      try {
        const parsed = parseBackup(await file.text());
        setPending(parsed);
        show(`This replaces what you have now with ${describeBackup(parsed.data)}.`);
      } catch (error) {
        setPending(null);
        show(error.message, 'backup-message--error');
      }
    });

    cancel.addEventListener('click', () => {
      setPending(null);
      show('');
    });

    restore.addEventListener('click', async () => {
      try {
        await chrome.storage.local.set(pending.data);
        checkAllChannels();
        setPending(null);
        show('Restored. Reload any open Twitch tabs to see everything.');
      } catch {
        setPending(null);
        show("That backup couldn't be saved, so nothing changed.", 'backup-message--error');
      }
    });

    const controls = document.createElement('div');
    controls.className = 'backup-controls';
    controls.append(input, choose, restore, cancel);
    const wrapper = document.createElement('div');
    wrapper.append(controls, message);
    return wrapper;
  }

  skek.backup = { KEY_DEFAULTS, NOT_BACKED_UP, createBackup, parseBackup, describeBackup, saveControl, restoreControl };
})();
