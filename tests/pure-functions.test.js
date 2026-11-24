// Tests for the pure functions that parse YouTube's pages and format numbers.
// Run with plain `node --test` from the repo root.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

import { extractJson } from '../src/features/youtube/background/youtube-pages.js';
import { viewerCount } from '../src/features/youtube/background/live-entry.js';
import { inputToUrl } from '../src/features/youtube/background/channels.js';
import { liveChannelsFromGuide, signInFromPage } from '../src/features/youtube/background/subscriptions.js';
import { subscriptionsToRead } from '../src/features/youtube/background/poller.js';
import { flippedSettings } from '../src/background/renamed-settings.js';
import { channelPageToLive, followedStreamToLive, slugFromInput, startedAtIso } from '../src/features/kick/background/kick-api.js';
import { copyExpiry, isRealCookie } from '../src/features/kick/background/twitch-frame-cookies.js';
import { isSamePage, liveChanges, notificationAddress, notificationFor, notificationId, streamAddress } from '../src/features/notifications/background/live-changes.js';
import { twitchLiveFrom } from '../src/features/notifications/background/twitch-live.js';

// format.js is a classic content script, so it runs in a context holding the globals it expects.
const context = { skek: { helpers: { el() {} }, streams: {} } };
vm.runInNewContext(readFileSync(new URL('../src/features/streams/twitch/format.js', import.meta.url), 'utf8'), context);
const { compact } = context.skek.streams;

const favoritesContext = { skek: { helpers: { onBodyReady() {} }, streams: {} } };
vm.runInNewContext(readFileSync(new URL('../src/features/streams/twitch/favorites.js', import.meta.url), 'utf8'), favoritesContext);
const { moveFavorite, twitchStatusFrom } = favoritesContext.skek.streams;

// Objects from another vm context have a different Object, which deepEqual tells apart.
const plain = (value) => JSON.parse(JSON.stringify(value));

const chatWordsContext = { skek: {}, window: {}, location: { hostname: 'www.twitch.tv', ancestorOrigins: [] } };
vm.runInNewContext(readFileSync(new URL('../src/features/chat/chat-words.js', import.meta.url), 'utf8'), chatWordsContext);
const { addWords, wordPattern } = chatWordsContext.skek.chatWords;
const matchesWords = (words, text) => new RegExp(wordPattern(words), 'iu').test(text);

const chatEmotesContext = { skek: {}, window: {}, location: { ancestorOrigins: [] }, URL };
vm.runInNewContext(readFileSync(new URL('../src/features/chat/emotes.js', import.meta.url), 'utf8'), chatEmotesContext);
const { channelFromPath, videoFromPath, chatBoxAddition, sevenTvEmotes, bttvEmotes, ffzEmotes, ffzGlobalSets, mergeEmotes, messageParts, loadLists, allLoaded, emoteSections } = chatEmotesContext.skek.chatEmotes;
const names = (emotes) => plain(emotes.map((emote) => emote.name));

// Loads after emotes.js, as in the manifest.
vm.runInNewContext(readFileSync(new URL('../src/features/chat/recent-emotes.js', import.meta.url), 'utf8'), chatEmotesContext);
const { addRecent, shownEmotes, twitchId } = chatEmotesContext.skek.recentEmotes;

test('addRecent puts the emotes just sent first, the last one before the others, each name once', () => {
  const recent = [{ name: 'KEKW' }, { name: 'Kappa', twitch: '25' }, { name: 'EZ' }];
  const sent = [{ name: 'EZ', twitch: null }, { name: 'Pog', twitch: null }, { name: 'EZ', twitch: null }, { name: 'LUL', twitch: '425618' }];
  assert.deepEqual(plain(addRecent(recent, sent)), [{ name: 'LUL', twitch: '425618' }, { name: 'EZ' }, { name: 'Pog' }, { name: 'KEKW' }, { name: 'Kappa', twitch: '25' }]);
  assert.deepEqual(plain(addRecent(recent, [{ name: 'KEKW', twitch: null }])), recent, 'sending the first one again changes nothing');
  assert.deepEqual(plain(addRecent(recent, [])), recent);
  const many = Array.from({ length: 60 }, (_, index) => ({ name: `emote${index}`, twitch: null }));
  const kept = addRecent(recent, many);
  assert.equal(kept.length, 48);
  assert.equal(kept[0].name, 'emote59');
});

test('shownEmotes leaves out the emotes this chat has no image for', () => {
  const recent = [{ name: 'a' }, { name: 'b', twitch: '1' }, { name: 'c' }, { name: 'd' }];
  const emoteFor = (name, twitch) => (name === 'c' ? null : { name, twitch });
  assert.deepEqual(plain(shownEmotes(recent, emoteFor, 2)), [{ name: 'a' }, { name: 'b', twitch: '1' }]);
  assert.deepEqual(plain(shownEmotes(recent, emoteFor, 10)).map((emote) => emote.name), ['a', 'b', 'd']);
});

test("twitchId reads an emote's id from Twitch's image address, and nothing from another", () => {
  assert.equal(twitchId('https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_38b199e5/default/dark/1.0'), 'emotesv2_38b199e5');
  assert.equal(twitchId('https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/2.0'), '25');
  assert.equal(twitchId('https://cdn.7tv.app/emote/abc/1x.webp'), null);
  assert.equal(twitchId('https://example.com/?https://static-cdn.jtvnw.net/emoticons/v2/25/'), null);
});

// Loads after emotes.js, as in the manifest.
vm.runInNewContext(readFileSync(new URL('../src/features/chat/followed.js', import.meta.url), 'utf8'), chatEmotesContext);
const { isCommand, timeSince, followedFrom, answerText, cardText } = chatEmotesContext.skek.followed;
// Midday where the tests run, so the day is the same in every time zone.
const midday = (year, month, day) => new Date(year, month - 1, day, 12);

test('isCommand takes /followed alone, in any case, and nothing else', () => {
  for (const text of ['/followed', '﻿/followed', ' /Followed ', '/FOLLOWED']) assert.equal(isCommand(text), true, text);
  for (const text of ['', '/follow', '/followers', '/followed me', 'hi /followed']) assert.equal(isCommand(text), false, text);
});

test('timeSince counts whole years and months, and days under a month', () => {
  assert.equal(timeSince(midday(2015, 8, 22), midday(2026, 11, 14)), '11 years and 2 months');
  assert.equal(timeSince(midday(2015, 8, 22), midday(2026, 8, 21)), '10 years and 11 months');
  assert.equal(timeSince(midday(2025, 11, 14), midday(2026, 11, 14)), '1 year');
  assert.equal(timeSince(midday(2026, 10, 14), midday(2026, 11, 14)), '1 month');
  assert.equal(timeSince(midday(2026, 10, 20), midday(2026, 11, 14)), '25 days');
  assert.equal(timeSince(new Date(2026, 10, 13, 23), new Date(2026, 10, 14, 1)), '1 day');
  assert.equal(timeSince(midday(2026, 11, 14), midday(2026, 11, 14)), '');
  assert.equal(timeSince(midday(2026, 11, 15), midday(2026, 11, 14)), '', 'a clock that is behind');
});

test('followedFrom reads the date from Twitch, or says why there is none', () => {
  const following = followedFrom({ user: { displayName: 'summit1g', self: { follower: { followedAt: '2015-08-22T22:50:01Z' } } } }, 'summit1g');
  assert.equal(following.state, 'following');
  assert.equal(following.name, 'summit1g');
  assert.equal(following.at.toISOString(), '2015-08-22T22:50:01.000Z');
  assert.deepEqual(plain(followedFrom({ user: { displayName: 'Summit', self: { follower: null } } }, 'summit1g')), { state: 'notFollowing', name: 'Summit' });
  assert.deepEqual(plain(followedFrom({ user: { displayName: null, self: null } }, 'summit1g')), { state: 'notFollowing', name: 'summit1g' });
  assert.deepEqual(plain(followedFrom({ user: { self: { follower: { followedAt: 'soon' } } } }, 'x')), { state: 'notFollowing', name: 'x' });
  for (const data of [null, undefined, {}, { user: null }]) assert.deepEqual(plain(followedFrom(data, 'x')), { state: 'failed' });
});

test('answerText says when you followed and how long ago, or why it cannot', () => {
  const at = midday(2015, 8, 22);
  const now = midday(2026, 11, 14);
  assert.equal(answerText({ state: 'following', name: 'summit1g', at }, now, 'en-US'), 'You followed summit1g on August 22, 2015, 11 years and 2 months ago.');
  assert.equal(answerText({ state: 'following', name: 'summit1g', at: now }, now, 'en-US'), 'You followed summit1g on November 14, 2026.');
  assert.equal(answerText({ state: 'notFollowing', name: 'summit1g' }, now, 'en-US'), "You don't follow summit1g.");
  assert.match(answerText({ state: 'failed' }, now, 'en-US'), /\/followed/);
  assert.match(answerText({ state: 'signedOut' }, now, 'en-US'), /Sign in/);
  assert.equal(cardText(at, 'en-US'), 'Followed since August 22, 2015');
});

const goLiveContext = { skek: {} };
vm.runInNewContext(readFileSync(new URL('../src/features/player/go-live.js', import.meta.url), 'utf8'), goLiveContext);
const { channelPage, reloadNow } = goLiveContext.skek.goLive;

test("channelPage is a channel's own page, not its other tabs", () => {
  assert.equal(channelPage('/sodapoppin', channelFromPath), 'sodapoppin');
  assert.equal(channelPage('/SodaPoppin/', channelFromPath), 'sodapoppin');
  for (const path of ['/sodapoppin/about', '/sodapoppin/videos', '/sodapoppin/clips', '/sodapoppin/schedule', '/popout/sodapoppin/chat', '/directory', '/videos/123', '/']) {
    assert.equal(channelPage(path, channelFromPath), null, path);
  }
});

test('reloadNow reloads when a channel goes live, then twice more at most if the page stays offline', () => {
  const at = 1_000_000;
  assert.equal(reloadNow('soda', true, null, at), true, 'Twitch said offline before, so it just went live');
  assert.equal(reloadNow('soda', false, null, at), false, 'live already when the page opened');
  const once = { login: 'soda', at, tries: 1 };
  assert.equal(reloadNow('soda', false, once, at + 19_000), false);
  assert.equal(reloadNow('soda', false, once, at + 20_000), true);
  const twice = { login: 'soda', at, tries: 2 };
  assert.equal(reloadNow('soda', false, twice, at + 59_000), false);
  assert.equal(reloadNow('soda', false, twice, at + 60_000), true);
  assert.equal(reloadNow('soda', false, { login: 'soda', at, tries: 3 }, at + 240_000), false, 'left alone after three');
  assert.equal(reloadNow('other', false, once, at + 30_000), false, 'a reload for another channel');
  assert.equal(reloadNow('soda', false, once, at + 301_000), false, 'a reload for an earlier stream');
});

const sortOrderContext = { skek: {} };
vm.runInNewContext(readFileSync(new URL('../src/features/browse/sort-order.js', import.meta.url), 'utf8'), sortOrderContext);
const { sortFrom, picksFrom, settle } = sortOrderContext.skek.sortOrder;
const BROWSE_SORT = 'browseAllCategoriedPageSort';
const CHANNELS_SORT = 'directoryAllChannelPageSort';
const CATEGORY_SORT = 'directoryGameChannelPageSort';

test("sortFrom reads a sort as Twitch keeps it, and nothing from anything else", () => {
  assert.equal(sortFrom('"VIEWER_COUNT"'), 'VIEWER_COUNT');
  assert.equal(sortFrom('"RECENT"'), 'RECENT');
  for (const text of [null, '', 'VIEWER_COUNT', '"NEWEST"', 'true', '{"a":1}']) assert.equal(sortFrom(text), null, String(text));
});

test('picksFrom keeps only the places and sorts Twitch has', () => {
  const kept = { [CATEGORY_SORT]: 'VIEWER_COUNT', [BROWSE_SORT]: 'NEWEST', other: 'RECENT', [CHANNELS_SORT]: 5 };
  assert.deepEqual(plain(picksFrom(JSON.stringify(kept))), { [CATEGORY_SORT]: 'VIEWER_COUNT' });
  for (const text of [null, '', 'not json', '"RECENT"', '[]', 'null']) assert.deepEqual(plain(picksFrom(text)), {}, String(text));
});

test('settle remembers a pick from the sort menu, and puts picks back when Twitch changes them', () => {
  const picks = { [CATEGORY_SORT]: 'RECENT' };
  const newTab = { [BROWSE_SORT]: null, [CHANNELS_SORT]: null, [CATEGORY_SORT]: null };
  assert.deepEqual(plain(settle(picks, newTab, false)), { remember: picks, putBack: { [CATEGORY_SORT]: 'RECENT' } });
  assert.deepEqual(plain(settle({}, newTab, false)), { remember: {}, putBack: {} }, 'with nothing picked yet, Twitch is left alone');

  const twitchReset = { [BROWSE_SORT]: 'RELEVANCE', [CHANNELS_SORT]: 'RELEVANCE', [CATEGORY_SORT]: 'RELEVANCE' };
  assert.deepEqual(plain(settle(picks, twitchReset, false)), { remember: picks, putBack: { [CATEGORY_SORT]: 'RECENT' } });

  const picked = { ...twitchReset, [CHANNELS_SORT]: 'VIEWER_COUNT', [CATEGORY_SORT]: 'RECENT' };
  assert.deepEqual(plain(settle(picks, picked, true)), {
    remember: { [CATEGORY_SORT]: 'RECENT', [BROWSE_SORT]: 'RELEVANCE', [CHANNELS_SORT]: 'VIEWER_COUNT' },
    putBack: {},
  });
  assert.deepEqual(plain(settle(picks, { ...newTab, [CATEGORY_SORT]: 'RECENT' }, false)), { remember: picks, putBack: {} });
});

test('channelFromPath finds the channel in each address with chat, and nothing elsewhere', () => {
  assert.equal(channelFromPath('/SodaPoppin'), 'sodapoppin');
  assert.equal(channelFromPath('/sodapoppin/about'), 'sodapoppin');
  assert.equal(channelFromPath('/popout/sodapoppin/chat'), 'sodapoppin');
  assert.equal(channelFromPath('/embed/sodapoppin/chat'), 'sodapoppin');
  assert.equal(channelFromPath('/moderator/sodapoppin'), 'sodapoppin');
  assert.equal(channelFromPath('/popout/moderator/sodapoppin/chat'), 'sodapoppin');
  for (const path of ['/', '/directory/following', '/videos/123', '/settings/profile', '/not.a.channel']) {
    assert.equal(channelFromPath(path), null, path);
  }
});

test('videoFromPath finds the video in its address, and nothing elsewhere', () => {
  assert.equal(videoFromPath('/videos/2921120349'), '2921120349');
  assert.equal(videoFromPath('/videos/2921120349/'), '2921120349');
  for (const path of ['/', '/videos', '/videos/abc', '/sodapoppin/videos', '/sodapoppin']) {
    assert.equal(videoFromPath(path), null, path);
  }
});

const chatBoxContext = {};
vm.runInNewContext(readFileSync(new URL('../src/features/chat/chat-box-emotes.js', import.meta.url), 'utf8'), chatBoxContext);
const { finishedEmotes, wordToComplete, emoteCompletions } = chatBoxContext.skekChatBoxEmotes;

test('wordToComplete finds the word before the cursor, and leaves what Twitch completes itself', () => {
  assert.deepEqual(plain(wordToComplete('hi KE', 5)), { word: 'KE', start: 3 });
  assert.deepEqual(plain(wordToComplete('hi KE there', 5)), { word: 'KE', start: 3 });
  assert.equal(wordToComplete('hi KEKW', 5), null, 'the cursor is inside the word');
  assert.equal(wordToComplete('hi ', 3), null, 'there is no word yet');
  assert.equal(wordToComplete('', 0), null);
  for (const text of ['@name', ':emote', '/me']) assert.equal(wordToComplete(text, text.length), null, text);
});

test('emoteCompletions matches the start of a name in any case, with matching case first', () => {
  const names = ['KEKW', 'kekw2', 'KEK', 'pepeKEK', 'KEK', 'Kappa'];
  assert.deepEqual(plain(emoteCompletions('KE', names)), ['KEK', 'KEKW', 'kekw2']);
  assert.deepEqual(plain(emoteCompletions('ke', names)), ['kekw2', 'KEK', 'KEKW']);
  assert.deepEqual(plain(emoteCompletions('nothing', names)), []);
});

test('finishedEmotes only finds whole emote names the cursor has left, last first', () => {
  const table = new Map([['KEK', {}], ['KEKW', {}], ['EZ', {}]]);
  const found = (text, caret) => plain(finishedEmotes(text, caret, table)).map(({ name, start }) => `${name}@${start}`);
  assert.deepEqual(found('hi KEK', 6), [], 'the cursor is right after it');
  assert.deepEqual(found('hi KEK', 4), [], 'the cursor is inside it');
  assert.deepEqual(found('hi KEK ', 7), ['KEK@3'], 'a space was typed after it');
  assert.deepEqual(found('hi KEKW', 7), []);
  assert.deepEqual(found('hi KEKW', 0), ['KEKW@3'], 'the cursor moved away');
  assert.deepEqual(found('KEK EZ', null), ['EZ@4', 'KEK@0'], 'the cursor is in another piece of the text');
  assert.deepEqual(found('KEKWW constructor', null), []);
});

test('loadLists leaves out a service that failed, and tries only that one again', async () => {
  const calls = [];
  const loaders = (ffzWorks) => ({
    '7TV': async () => { calls.push('7TV'); return ['a']; },
    FFZ: async () => { calls.push('FFZ'); if (!ffzWorks) throw new Error('down'); return ['b']; },
    BTTV: async () => { calls.push('BTTV'); return []; },
  });
  const first = await loadLists(loaders(false));
  assert.deepEqual(plain(Object.keys(first).sort()), ['7TV', 'BTTV']);
  assert.ok(!allLoaded(first));

  calls.length = 0;
  const second = await loadLists(loaders(true), first);
  assert.deepEqual(calls, ['FFZ']);
  assert.ok(allLoaded(second));
  assert.deepEqual(plain(second.FFZ), ['b']);
});

test('emoteSections lists each service in order, with only the emotes that won their name', () => {
  const emote = (name) => ({ name });
  const channel = { '7TV': [emote('a')], FFZ: [], BTTV: [emote('b'), emote('a')] };
  const global = { '7TV': [emote('b'), emote('c')], FFZ: [emote('d')] };
  const sections = emoteSections(channel, global, mergeEmotes(channel, global));
  assert.deepEqual(plain(sections.map(({ title, emotes }) => [title, emotes.map(({ name }) => name)])), [
    ['7TV channel emotes', ['a']],
    ['BTTV channel emotes', ['b']],
    ['7TV global emotes', ['c']],
    ['FFZ global emotes', ['d']],
  ]);
});

const backupContext = { URL };
vm.runInNewContext(readFileSync(new URL('../src/settings.js', import.meta.url), 'utf8'), backupContext);
vm.runInNewContext(readFileSync(new URL('../src/features/streams/sites.js', import.meta.url), 'utf8'), backupContext);
vm.runInNewContext(readFileSync(new URL('../src/settings-window/backup.js', import.meta.url), 'utf8'), backupContext);
const { KEY_DEFAULTS, NOT_BACKED_UP, createBackup, parseBackup, describeBackup } = backupContext.skek.backup;
const backupFile = (data, extra = {}) => JSON.stringify({ app: 'StreamKEK', backupVersion: 1, data, ...extra });

test('a backup saves everything, and restoring it gives back the same', () => {
  const saved = {
    theme: 'light',
    hideForYou: true,
    channels: [{ id: 'UC554eY5jNUfDq3yDOJYirOQ', name: 'Destiny', handle: '@destiny', avatar: 'https://yt3.ggpht.com/a=s88' }],
    subChannels: { UCabc: { id: 'UCabc', name: 'Sub', handle: '@sub.channel-1' } },
    kickChannels: [{ id: 'kick:conner', platform: 'kick', slug: 'conner', name: 'Conner', handle: 'conner' }],
    kickHidden: { 'kick:x_y-z': { id: 'kick:x_y-z', platform: 'kick', slug: 'x_y-z', name: 'X' } },
    favoriteChannels: [{ id: 'twitch:summit1g', platform: 'twitch', login: 'summit1g', name: 'summit1g' }],
    chatBlockedWords: ['a phrase'],
    chatHighlightedWords: ['word'],
    kickVolume: 0.5,
    chatHidden: true,
    floatingChat: { x: 10, y: 20, opacity: 0.5 },
    recentEmotes: [{ name: 'KEKW' }, { name: ':)', twitch: '1' }, { name: 'esfandPls', twitch: 'emotesv2_38b199e5' }],
  };
  const backup = createBackup(saved, '1.4.0', new Date('2026-11-07T00:00:00Z'));
  assert.equal(backup.extensionVersion, '1.4.0');
  const { data } = parseBackup(JSON.stringify(backup));
  for (const key of Object.keys(saved)) assert.deepEqual(plain(data[key]), saved[key], key);
  assert.equal(data.showKickLive, true, 'a setting never changed is saved with its default');
  assert.deepEqual(plain(data.kickFollowed), {}, 'an empty list is saved too');
  assert.equal(Object.keys(data).length, Object.keys(KEY_DEFAULTS).length);
});

test('parseBackup refuses a file that is not a backup, or is from a newer version', () => {
  for (const text of ['not json', 'null', '[]', '{}', '{"app":"Other","backupVersion":1,"data":{}}', backupFile('x'), backupFile({ unknown: 1 })]) {
    assert.throws(() => parseBackup(text), undefined, text);
  }
  assert.throws(() => parseBackup(backupFile({ theme: 'dark' }, { backupVersion: 2 })), /newer/);
  assert.throws(() => parseBackup(backupFile({ theme: 'dark' }, { backupVersion: 'x' })));
  assert.throws(() => parseBackup('x'.repeat(5_000_001)), /too big/);
});

test('parseBackup keeps only what is valid, and leaves out the rest', () => {
  const { data } = parseBackup(backupFile({
    theme: 'purple',
    hideForYou: 'yes',
    chatFontSize: '14',
    live: { x: {} },
    kickVolume: 5,
    chatHidden: 1,
    chatBlockedWords: ['ok', '', 3, 'x'.repeat(301)],
    floatingChat: { x: 1, y: 'no', extra: 2, width: null },
    recentEmotes: [{ name: 'KEKW', twitch: '../x', count: 3 }, { name: 'two words' }, { name: '' }, { twitch: '25' }, 'Kappa', null, { name: 'Kappa', twitch: '25' }],
    channels: [
      { id: 'UCgood', name: 'Good', avatar: 'http://example.com/a.png', extra: 'dropped', handle: '@a/../b', slug: '../x', login: 'a b', platform: 'a/b' },
      { id: '../../evil', name: 'Bad' },
      { id: '..', name: 'Bad' },
      { id: 'UCnoName' },
      'text',
      null,
    ],
    hiddenChannels: { wrongKey: { id: 'UCright', name: 'Right', avatar: 'https://example.com/a.png' }, bad: { id: 'a/b', name: 'Bad' } },
    subChannels: [],
  }));
  assert.deepEqual(plain(data), {
    chatFontSize: '14',
    chatBlockedWords: ['ok'],
    floatingChat: { x: 1 },
    recentEmotes: [{ name: 'KEKW' }, { name: 'Kappa', twitch: '25' }],
    channels: [{ id: 'UCgood', name: 'Good' }],
    hiddenChannels: { UCright: { id: 'UCright', name: 'Right', avatar: 'https://example.com/a.png' } },
  });
});

test('a backup file cannot change how objects work', () => {
  const { data } = parseBackup('{"app":"StreamKEK","backupVersion":1,"data":{"__proto__":{"polluted":true},"theme":"dark","subChannels":{"a":{"id":"__proto__","name":"x"}}}}');
  assert.equal(data.polluted, undefined);
  assert.equal({}.polluted, undefined);
  assert.equal(data.theme, 'dark');
});

test('describeBackup says what a backup holds', () => {
  assert.equal(
    describeBackup({ channels: [{}], kickChannels: [{}], favoriteChannels: [{}], hiddenChannels: {}, chatBlockedWords: ['a'], chatHighlightedWords: ['b', 'c'] }),
    '2 added channels, 1 favorite, 0 hidden channels, 3 chat words, your settings',
  );
});

test('every storage key is backed up or known to be temporary', () => {
  const contributing = readFileSync(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8').split('## Storage keys')[1];
  const rows = contributing.split(String.fromCharCode(10)).filter((line) => line.startsWith('| `'));
  const keys = rows.flatMap((row) => [...row.split('|')[1].matchAll(/`([a-zA-Z]+)`/g)].map((match) => match[1]));
  assert.ok(keys.includes('favoriteChannels'), 'the table should be readable');
  for (const key of keys) assert.ok(key in KEY_DEFAULTS || NOT_BACKED_UP.includes(key), `${key} needs a place in backup.js`);
});

test('chatBoxAddition keeps an emote apart from what is already in the chat box', () => {
  assert.equal(chatBoxAddition('', 'KEKW'), 'KEKW ');
  assert.equal(chatBoxAddition('\uFEFF', 'KEKW'), 'KEKW ');
  assert.equal(chatBoxAddition('hello', 'KEKW'), ' KEKW ');
  assert.equal(chatBoxAddition('hello ', 'KEKW'), 'KEKW ');
});

test('sevenTvEmotes uses the name the channel gave it, and skips unlisted emotes and other image hosts', () => {
  const emote = (name, listed = true, url = '//cdn.7tv.app/emote/abc') => ({
    name,
    data: { name: 'original', listed, host: { url, files: [{ width: 64, height: 32 }] } },
  });
  const emotes = sevenTvEmotes([emote('renamed'), emote('unlisted', false), emote('elsewhere', true, '//example.com/emote/abc'), emote('http', true, 'http://cdn.7tv.app/emote/abc'), {}]);
  assert.deepEqual(plain(emotes), [{
    name: 'renamed',
    src: 'https://cdn.7tv.app/emote/abc/1x.webp',
    srcset: 'https://cdn.7tv.app/emote/abc/1x.webp 1x, https://cdn.7tv.app/emote/abc/2x.webp 2x, https://cdn.7tv.app/emote/abc/4x.webp 4x',
    width: 64,
    height: 32,
  }]);
  assert.deepEqual(plain(sevenTvEmotes(undefined)), []);
});

test('bttvEmotes skips modifiers and an id that could change the address', () => {
  const emotes = bttvEmotes([{ id: 'abc123', code: 'one' }, { id: 'def', code: 'w!', modifier: true }, { id: '../evil', code: 'two' }, { code: 'three' }]);
  assert.deepEqual(names(emotes), ['one']);
  assert.equal(emotes[0].src, 'https://cdn.betterttv.net/emote/abc123/1x.webp');
});

test('ffzEmotes prefers moving images, keeps the sizes that exist, and skips effects and other image hosts', () => {
  const cdn = 'https://cdn.frankerfacez.com/emote';
  const emotes = ffzEmotes([{
    emoticons: [
      { name: 'moving', width: 32, height: 32, urls: { 1: `${cdn}/1/1` }, animated: { 1: `${cdn}/1/animated/1`, 2: `${cdn}/1/animated/2` } },
      { name: 'small', urls: { 1: `${cdn}/2/1` } },
      { name: 'effect', modifier: true, urls: { 1: `${cdn}/3/1` } },
      { name: 'elsewhere', urls: { 1: 'https://example.com/4/1' } },
    ],
  }]);
  assert.deepEqual(names(emotes), ['moving', 'small']);
  assert.equal(emotes[0].srcset, `${cdn}/1/animated/1 1x, ${cdn}/1/animated/2 2x`);
  assert.equal(emotes[1].srcset, `${cdn}/2/1 1x`);
});

test('ffzGlobalSets leaves out sets not everyone gets', () => {
  const sets = ffzGlobalSets({ default_sets: [3], sets: { 3: { title: 'everyone' }, 9: { title: 'subscribers' } } });
  assert.deepEqual(plain(sets), [{ title: 'everyone' }]);
  assert.deepEqual(plain(ffzGlobalSets(null)), []);
});

test('mergeEmotes puts channel emotes before global ones, then 7TV, FFZ and BTTV', () => {
  const emote = (name, service) => ({ name, service });
  const table = mergeEmotes(
    { '7TV': [emote('a', '7TV')], FFZ: [emote('a', 'FFZ'), emote('b', 'FFZ')], BTTV: [emote('a', 'BTTV'), emote('b', 'BTTV'), emote('c', 'BTTV')] },
    { '7TV': [emote('c', '7TV'), emote('d', '7TV')], FFZ: [emote('d', 'FFZ'), emote('e', 'FFZ')], BTTV: [emote('e', 'BTTV')] },
  );
  const winners = Object.fromEntries([...table].map(([name, { service }]) => [name, service]));
  assert.deepEqual(plain(winners), { a: '7TV', b: 'FFZ', c: 'BTTV', d: '7TV', e: 'FFZ' });
  assert.equal(table.has('constructor'), false);
});

test('mergeEmotes stops at its limit and copes with a service that failed', () => {
  const many = Array.from({ length: 10_001 }, (_, index) => ({ name: `emote${index}` }));
  assert.equal(mergeEmotes({ '7TV': many }, {}).size, 10_000);
  assert.equal(mergeEmotes({}, {}).size, 0);
});

test('messageParts swaps only exact words and keeps the spacing around them', () => {
  const kekw = { name: 'KEKW' };
  const table = new Map([['KEKW', kekw]]);
  assert.deepEqual(plain(messageParts('that was KEKW  great KEKW', table)), ['that was ', kekw, '  great ', kekw]);
  assert.deepEqual(plain(messageParts('KEKW', table)), [kekw]);
  assert.equal(messageParts('kekw KEKW, aKEKW constructor', table), null);
});

test('addWords splits on commas, tidies spaces and skips repeats in any case', () => {
  assert.deepEqual(plain(addWords(['Spoiler'], ' spoiler, new  phrase ,,KEKW\nother')), ['Spoiler', 'new phrase', 'KEKW', 'other']);
  assert.deepEqual(plain(addWords([], 'x'.repeat(81))), []);
});

test('wordPattern matches whole words in any case, and nothing when there are none', () => {
  assert.equal(wordPattern([]), null);
  assert.ok(matchesWords(['ass'], 'what an ASS!'));
  assert.ok(!matchesWords(['ass'], 'first class'));
  assert.ok(!matchesWords(['las'], 'lås'));
});

test('wordPattern takes phrases, other alphabets and characters a pattern treats specially', () => {
  assert.ok(matchesWords(['big spoiler'], 'a big   spoiler here'));
  assert.ok(matchesWords(['c++'], 'I love C++ a lot'));
  assert.ok(matchesWords(['a-b', '(x)'], 'see (x) now'));
  assert.ok(matchesWords(['لا'], 'قال لا الآن'));
  assert.ok(!matchesWords(['لا'], 'لاعب'));
});

test('moveFavorite adds a new favorite where it was dropped, or last', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(plain(moveFavorite(list, { id: 'c' }, 'b')), [{ id: 'a' }, { id: 'c' }, { id: 'b' }]);
  assert.deepEqual(plain(moveFavorite(list, { id: 'c' }, undefined)), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('moveFavorite moves a favorite without repeating it', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(plain(moveFavorite(list, { id: 'c' }, 'a')), [{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  assert.deepEqual(plain(moveFavorite(list, { id: 'a' }, undefined)), [{ id: 'b' }, { id: 'c' }, { id: 'a' }]);
});

test('twitchStatusFrom tells live, offline and missing channels apart', () => {
  const status = plain(twitchStatusFrom([
    { login: 'on', displayName: 'On', profileImageURL: 'pic', stream: { viewersCount: 5, title: 'T', game: { displayName: 'G' } } },
    { login: 'off', displayName: 'Off', profileImageURL: 'pic', stream: null },
    null,
  ]));
  assert.deepEqual(status['twitch:on'].live, {
    title: 'T',
    category: 'G',
    viewers: 5,
    thumbnail: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_on-440x248.jpg',
  });
  assert.equal(status['twitch:off'].live, null);
  assert.equal(Object.keys(status).length, 2);
});

const multiContext = { skek: { streams: {} } };
vm.runInNewContext(readFileSync(new URL('../src/features/streams/twitch/multi-layout.js', import.meta.url), 'utf8'), multiContext);
const { multiLayout, parseMultiHash, multiHash, swapStreams } = multiContext.skek.streams;

function assertInside(rect, width, height) {
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width + 1 && rect.y + rect.h <= height + 1, `${JSON.stringify(rect)} is outside ${width}x${height}`);
}

test('multiLayout gives two streams a chat each, under them', () => {
  const { players, chats, chat, picker } = plain(multiLayout({ count: 2, width: 1600, height: 900, chat: true }));
  assert.deepEqual(players.map((p) => [p.x, p.y, p.w]), [[0, 0, 800], [800, 0, 800]]);
  assert.equal(players[0].h, 478); // 450 of 16:9 video, plus its bar
  assert.deepEqual(chats, [{ x: 0, y: 478, w: 800, h: 422 }, { x: 800, y: 478, w: 800, h: 422 }]);
  assert.equal(chat, null);
  assert.equal(picker, null);
});

test('multiLayout leaves two chats room to read in a short window', () => {
  const { players, chats } = plain(multiLayout({ count: 2, width: 1600, height: 500, chat: true }));
  assert.equal(chats[0].h, 220);
  assert.equal(players[0].h, 280);
});

test('multiLayout shares one chat between three or four streams', () => {
  for (const count of [3, 4]) {
    const { players, chats, chat, picker } = plain(multiLayout({ count, width: 1600, height: 900, chat: true }));
    assert.equal(players.length, count);
    assert.equal(chats, null);
    assert.deepEqual(picker, { x: 1260, y: 0, w: 340, h: 40 });
    assert.deepEqual(chat, { x: 1260, y: 40, w: 340, h: 860 });
    for (const player of players) assertInside(player, 1260, 900);
  }
});

test('multiLayout moves a shared chat under the streams in a narrow window', () => {
  const { players, chat, picker } = plain(multiLayout({ count: 3, width: 800, height: 900, chat: true }));
  assert.equal(picker.y + picker.h, chat.y);
  assert.equal(chat.y + chat.h, 900);
  for (const player of players) assert.ok(player.y + player.h <= picker.y + 1);
});

test('multiLayout falls back to one chat when two wouldn\'t be readable', () => {
  const { chats, chat } = plain(multiLayout({ count: 2, width: 500, height: 900, chat: true }));
  assert.equal(chats, null);
  assert.ok(chat);
});

test('multiLayout keeps streams from overlapping or leaving the view, at any size', () => {
  for (const [width, height] of [[1600, 900], [2560, 1300], [900, 400], [320, 200]]) {
    for (const count of [2, 3, 4]) {
      for (const chat of [true, false]) {
        const { players } = plain(multiLayout({ count, width, height, chat }));
        assert.equal(players.length, count);
        players.forEach((a, i) => {
          assertInside(a, width, height);
          players.slice(i + 1).forEach((b) => {
            const apart = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
            assert.ok(apart, `${JSON.stringify(a)} overlaps ${JSON.stringify(b)} at ${width}x${height}, ${count} streams`);
          });
        });
      }
    }
  }
});

test('multiLayout gives the streams their bars\' room too where the bars lie over them', () => {
  const { players } = plain(multiLayout({ count: 4, width: 1600, height: 900, chat: false, bars: false }));
  assert.deepEqual(players, [{ x: 0, y: 0, w: 800, h: 450 }, { x: 800, y: 0, w: 800, h: 450 }, { x: 0, y: 450, w: 800, h: 450 }, { x: 800, y: 450, w: 800, h: 450 }]);
  const two = plain(multiLayout({ count: 2, width: 1600, height: 900, chat: true, bars: false }));
  assert.equal(two.players[0].h, 450);
  assert.equal(two.chats[0].y, 450);
});

test('multiLayout survives having no room at all, as before the page has laid out', () => {
  assert.equal(multiLayout({ count: 3, width: 0, height: 0, chat: true }).players.length, 3);
});

test('multiLayout makes the first of three streams the biggest', () => {
  const { players } = plain(multiLayout({ count: 3, width: 1260, height: 900, chat: false }));
  assert.ok(players[0].w > players[1].w);
  assert.equal(players[1].w, players[2].w);
});

test('multiLayout gives a divider between the streams, two where they split both ways', () => {
  const dividers = (count, chat, width = 1600) => plain(multiLayout({ count, width, height: 900, chat }).dividers).map((d) => `${d.split} ${d.axis}`);
  assert.deepEqual(dividers(2, true), ['main x']);
  assert.deepEqual(dividers(2, false), ['main x']);
  assert.deepEqual(dividers(2, false, 700), ['main y']);
  assert.deepEqual(dividers(3, false), ['main x', 'cross y']);
  assert.deepEqual(dividers(3, false, 700), ['main y', 'cross x']);
  assert.deepEqual(dividers(4, true), ['main x', 'cross y']);
});

test('multiLayout makes the first stream bigger when its dividers are dragged away from it', () => {
  for (const count of [2, 3, 4]) {
    for (const chat of [true, false]) {
      const sizes = (splits) => plain(multiLayout({ count, width: 1600, height: 900, chat, splits }).players).map((p) => p.w);
      const before = sizes({});
      const after = sizes({ main: 0.7, cross: 0.7 });
      assert.ok(after[0] > before[0], `${count} streams, chat ${chat}: ${after[0]} > ${before[0]}`);
      assert.ok(after[1] < before[1], `${count} streams, chat ${chat}: ${after[1]} < ${before[1]}`);
    }
  }
});

test('multiLayout puts a dragged divider where the pointer is', () => {
  const { dividers, players } = plain(multiLayout({ count: 4, width: 1600, height: 900, chat: false, splits: { main: 0.25, cross: 0.6 } }));
  const [main, cross] = dividers;
  assert.equal((main.x - main.start) / main.length, 0.25);
  assert.equal((cross.y - cross.start) / cross.length, 0.6);
  // Each stream sits against both dividers.
  assert.equal(players[0].x + players[0].w, main.x);
  assert.equal(players[0].y + players[0].h, cross.y);
  assert.deepEqual([players[3].x, players[3].y], [main.x, cross.y]);
});

test('multiLayout stops a divider before a stream or a chat gets too small', () => {
  const widths = (width, main) => plain(multiLayout({ count: 2, width, height: 900, chat: true, splits: { main } }).players).map((p) => p.w);
  assert.deepEqual(widths(1600, 0), [320, 1280]);
  assert.deepEqual(widths(1600, 3), [1280, 320]);
  // Two chats side by side each stay wide enough to read.
  assert.deepEqual(widths(700, 0), [280, 420]);
});

test('multiLayout keeps dragged streams from overlapping or leaving the view', () => {
  for (const [width, height] of [[1600, 900], [2560, 1300], [900, 400], [700, 1200]]) {
    for (const count of [2, 3, 4]) {
      for (const chat of [true, false]) {
        for (const splits of [{ main: 0 }, { main: 0.37, cross: 0.3 }, { main: 0.8, cross: 0.9 }, { cross: 1.4 }]) {
          const { players } = plain(multiLayout({ count, width, height, chat, splits }));
          players.forEach((a, i) => {
            assertInside(a, width, height);
            players.slice(i + 1).forEach((b) => {
              const apart = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
              assert.ok(apart, `${JSON.stringify(a)} overlaps ${JSON.stringify(b)} at ${width}x${height}, ${count} streams, ${JSON.stringify(splits)}`);
            });
          });
        }
      }
    }
  }
});

test('parseMultiHash reads streams from every site, and writes them back the same', () => {
  const hash = '#skek-multi=twitch/kaicenat,kick/some-name,youtube/UCabc_-/abcdefghijk';
  const entries = plain(parseMultiHash(hash));
  assert.deepEqual(entries, [
    { id: 'twitch:kaicenat', platform: 'twitch', key: 'kaicenat', videoId: null },
    { id: 'kick:some-name', platform: 'kick', key: 'some-name', videoId: null },
    { id: 'UCabc_-', platform: 'youtube', key: 'UCabc_-', videoId: 'abcdefghijk' },
  ]);
  assert.equal(multiHash(entries), hash);
});

test('parseMultiHash ignores what could reach anything but a channel', () => {
  assert.equal(parseMultiHash('').length, 0);
  assert.equal(parseMultiHash('#other=twitch/a').length, 0);
  for (const bad of ['twitch/../logout', 'kick/a/b', 'kick/a%2Fb', 'example/a', 'twitch/a&parent=evil', 'twitch/a-b', 'youtube/UC1/short', '']) {
    assert.equal(parseMultiHash(`#skek-multi=${bad}`).length, 0, bad);
  }
});

test('swapStreams swaps two streams and leaves the others in place', () => {
  const ids = (list) => [...list].map((e) => e.id).join();
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.equal(ids(swapStreams(list, 'a', 'c')), 'c,b,a,d');
  assert.equal(ids(swapStreams(list, 'd', 'b')), 'a,d,c,b');
  assert.equal(ids(swapStreams(list, 'a', 'gone')), 'a,b,c,d');
});

test('parseMultiHash keeps four streams at most, once each', () => {
  const ids = (hash) => parseMultiHash(hash).map((e) => e.id).join();
  assert.equal(ids('#skek-multi=twitch/a,twitch/A,kick/a'), 'twitch:a,kick:a');
  assert.equal(ids('#skek-multi=twitch/a,twitch/b,twitch/c,twitch/d,twitch/e'), 'twitch:a,twitch:b,twitch:c,twitch:d');
});

const sitesContext = { skek: {} };
vm.runInNewContext(readFileSync(new URL('../src/features/streams/sites.js', import.meta.url), 'utf8'), sitesContext);
const { sites, siteOf } = sitesContext.skek;

test('YouTube previews point at the stream and escape its id', () => {
  assert.equal(sites.youtube.previewUrl({ videoId: 'abc_-1' }), 'https://i.ytimg.com/vi/abc_-1/hqdefault_live.jpg');
  assert.equal(sites.youtube.previewUrl({ videoId: 'a/b' }), 'https://i.ytimg.com/vi/a%2Fb/hqdefault_live.jpg');
});

test('siteOf treats a channel saved without a platform as YouTube', () => {
  assert.equal(siteOf({ id: 'UC1' }).name, 'YouTube');
  assert.equal(siteOf({ id: 'kick:a', platform: 'kick' }).name, 'Kick');
});

test('resolveTheme shows a theme by name, with the one of Twitch\'s themes it is built on', () => {
  const { resolveTheme } = backupContext.skek;
  assert.deepEqual(plain(resolveTheme('cotton-candy')), { name: 'cotton-candy', base: 'light' });
  assert.deepEqual(plain(resolveTheme('light')), { name: 'light', base: 'light' });
  assert.deepEqual(plain(resolveTheme('ember')), { name: 'ember', base: 'dark' });
  // A theme from a newer version's backup, or one that was removed, and nothing saved yet.
  assert.deepEqual(plain(resolveTheme('gone')), { name: 'dark', base: 'dark' });
  assert.deepEqual(plain(resolveTheme(null)), { name: 'dark', base: 'dark' });
  assert.deepEqual(plain(resolveTheme(undefined)), { name: 'dark', base: 'dark' });
});

test('Twitch frames name this page as their parent, in the theme chosen', () => {
  sitesContext.location = { hostname: 'www.twitch.tv' };
  const urls = siteOf({ platform: 'twitch' }).frameUrls({ login: 'a' }, null, '#skek-theme=ember&skek-theme-base=dark');
  assert.equal(urls.player, 'https://player.twitch.tv/?channel=a&parent=www.twitch.tv');
  assert.equal(urls.chat, 'https://www.twitch.tv/embed/a/chat?parent=www.twitch.tv&darkpopout#skek-theme=ember&skek-theme-base=dark');
  const light = siteOf({ platform: 'twitch' }).frameUrls({ login: 'a' }, null, '#skek-theme=spring&skek-theme-base=light');
  assert.equal(light.chat, 'https://www.twitch.tv/embed/a/chat?parent=www.twitch.tv#skek-theme=spring&skek-theme-base=light');
});

test('Kick links are told apart from anything else', () => {
  const { linkPattern } = sites.kick;
  assert.ok(linkPattern.test('https://kick.com/odablock'));
  assert.ok(linkPattern.test('kick.com/odablock'));
  assert.ok(!linkPattern.test('https://www.youtube.com/@kick.com'));
  assert.ok(!linkPattern.test('@odablock'));
});

test('YouTube links are told apart from anything else', () => {
  const { linkPattern } = sites.youtube;
  assert.ok(linkPattern.test('https://www.youtube.com/@LofiGirl'));
  assert.ok(linkPattern.test('youtube.com/watch?v=abc'));
  assert.ok(linkPattern.test('https://youtu.be/abc'));
  assert.ok(linkPattern.test('https://m.youtube.com/@LofiGirl'));
  assert.ok(!linkPattern.test('https://kick.com/youtube.com/'));
  assert.ok(!linkPattern.test('@LofiGirl'));
});

test('liveChannelsFromGuide keeps only live channels, once each', () => {
  const entry = (id, live) => ({
    guideEntryRenderer: {
      entryData: { guideEntryData: { guideEntryId: id } },
      formattedTitle: { simpleText: 'Lofi Girl' },
      navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/@LofiGirl' } },
      thumbnail: { thumbnails: [{ url: 'small' }, { url: 'large' }] },
      ...(live ? { badges: { liveBroadcasting: true } } : {}),
    },
  });
  const lofi = 'UCSJ4gkVC6NrvII8umztf0Ow';
  const guide = { items: [entry(lofi, true), entry(lofi, true), entry('UCc5afI6aaaaaaaaaaaaaaaa', false), entry('FEwhat_to_watch', true)] };
  assert.deepEqual(liveChannelsFromGuide(guide), [{ id: lofi, name: 'Lofi Girl', handle: '@LofiGirl', avatar: 'large' }]);
});

test('signInFromPage reads what asking for the guide needs, or that you are signed out', () => {
  const page = '{"LOGGED_IN":true,"SESSION_INDEX":"2","INNERTUBE_CLIENT_VERSION":"2.20261120.01.00","DELEGATED_SESSION_ID":"1234567890"}';
  assert.deepEqual(signInFromPage(page, 5), { at: 5, authUser: '2', clientVersion: '2.20261120.01.00', pageId: '1234567890' });
  assert.deepEqual(signInFromPage('{"LOGGED_IN":true}', 5), { at: 5, authUser: '0', clientVersion: null, pageId: null });
  assert.equal(signInFromPage('{"LOGGED_IN":false,"SESSION_INDEX":"0"}', 5), null);
});

test('subscriptionsToRead leaves out a live subscription whose pages were just read', () => {
  const minutes = (count) => count * 60_000;
  const channels = [{ id: 'new' }, { id: 'recent' }, { id: 'old' }, { id: 'never' }];
  const previous = { recent: {}, old: {}, never: {} };
  const readAt = { new: minutes(9), recent: minutes(8), old: minutes(5) };
  const ids = (now) => subscriptionsToRead(channels, previous, readAt, now).map((c) => c.id);
  // One that wasn't live a minute ago is read whatever is remembered about it.
  assert.deepEqual(ids(minutes(10)), ['new', 'old', 'never']);
  // The fifth check after a read does it again, even if it comes a little early.
  assert.deepEqual(ids(minutes(13) - 5000), ['new', 'recent', 'old', 'never']);
  assert.deepEqual(ids(minutes(12)), ['new', 'old', 'never']);
});

test('flippedSettings keeps what people chose under the old hide settings', () => {
  assert.deepEqual(flippedSettings({ hideYouTubeLive: true }), { set: { showYouTubeLive: false }, remove: ['hideYouTubeLive'] });
  assert.deepEqual(flippedSettings({ hideKickLive: false }), { set: { showKickLive: true }, remove: ['hideKickLive'] });
  assert.deepEqual(flippedSettings({}), { set: {}, remove: [] });
});

test('slugFromInput reads Kick links and refuses anything else', () => {
  assert.equal(slugFromInput('Odablock'), 'odablock');
  assert.equal(slugFromInput('@some-name'), 'some-name');
  assert.equal(slugFromInput('https://kick.com/Odablock'), 'odablock');
  assert.equal(slugFromInput('kick.com/some-name?x=1'), 'some-name');
  assert.equal(slugFromInput('https://www.kick.com/popout/odablock/chat'), 'odablock');
  assert.equal(slugFromInput('https://player.kick.com/odablock'), 'odablock');
  assert.equal(slugFromInput('https://kick.com/'), null);
  assert.equal(slugFromInput('https://notkick.com/odablock'), null);
});

test('copies of Kick cookies last a day at most', () => {
  const now = 1_000_000;
  const day = 24 * 60 * 60;
  assert.equal(copyExpiry(now + 60, now), now + 60);
  assert.equal(copyExpiry(now + 30 * day, now), now + day);
  assert.equal(copyExpiry(undefined, now), now + day);
});

test('isRealCookie tells a copy by its partition, not its SameSite', () => {
  const real = { name: 'session_token', domain: 'kick.com', sameSite: 'lax' };
  assert.ok(isRealCookie(real));
  assert.ok(isRealCookie({ ...real, domain: '.kick.com', sameSite: 'no_restriction' }));
  assert.ok(!isRealCookie({ ...real, partitionKey: { topLevelSite: 'https://twitch.tv', hasCrossSiteAncestor: true } }));
  assert.ok(!isRealCookie({ ...real, name: 'other' }));
  assert.ok(!isRealCookie({ ...real, domain: 'kick.com.example.com' }));
});

// Runs a site's watch.js with stubs for the browser, and says whether it reduced the page to its player.
function reducesPage(path, ancestorOrigins) {
  const root = {
    reduced: false,
    classList: { add: () => (root.reduced = true) },
    toggleAttribute: () => (root.reduced = true),
    dataset: {},
  };
  vm.runInNewContext(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    location: { ancestorOrigins },
    window: { top: {} },
    document: { documentElement: root },
    skek: { settingDefaults: {} },
    chrome: { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } } },
    MutationObserver: class {
      observe() {}
    },
  });
  return root.reduced;
}

for (const path of ['src/features/kick/frames/watch.js', 'src/features/youtube/frames/watch.js']) {
  test(`${path} goes by the top of the frame chain`, () => {
    assert.ok(reducesPage(path, ['https://www.twitch.tv']));
    assert.ok(reducesPage(path, ['null', 'https://www.twitch.tv']));
    assert.ok(reducesPage(path, ['https://example.com', 'https://www.twitch.tv']));
    assert.ok(!reducesPage(path, []));
    assert.ok(!reducesPage(path, ['https://www.twitch.tv', 'https://example.com']));
    assert.ok(!reducesPage(path, ['https://nottwitch.tv']));
  });
}

test('startedAtIso treats Kick times as UTC', () => {
  assert.equal(startedAtIso('2026-11-05 11:21:54'), '2026-11-05T11:21:54.000Z');
  assert.equal(startedAtIso('2026-11-05T11:21:54Z'), '2026-11-05T11:21:54.000Z');
  assert.equal(startedAtIso(null), null);
  assert.equal(startedAtIso('soon'), null);
});

test('followedStreamToLive builds a channel and its live entry', () => {
  const { channel, entry } = followedStreamToLive({
    id: 136123059,
    session_title: 'Title',
    viewer_count: 10951,
    start_time: '2026-11-05 11:21:54',
    thumbnail: { src: 'thumb' },
    categories: [{ name: 'Old School RuneScape' }],
    channel: { slug: 'odablock', user: { username: 'Odablock', profilepic: 'pic' } },
  });
  assert.deepEqual(channel, { id: 'kick:odablock', platform: 'kick', slug: 'odablock', name: 'Odablock', handle: null, avatar: 'pic' });
  assert.equal(entry.videoId, '136123059');
  assert.equal(entry.category, 'Old School RuneScape');
  assert.equal(entry.streams.length, 1);
  assert.equal(followedStreamToLive({ id: 1 }), null);
});

test('channelPageToLive has no entry for an offline channel', () => {
  const page = { slug: 'odablock', user: { username: 'Odablock', profile_pic: 'pic' }, livestream: null };
  assert.equal(channelPageToLive(page).entry, null);
  assert.equal(channelPageToLive(page).channel.avatar, 'pic');
  assert.equal(channelPageToLive({ ...page, livestream: { id: 1, is_live: true } }).entry.category, 'Kick');
});

test('viewerCount reads plain numbers', () => {
  assert.equal(viewerCount('126 watching'), 126);
});

test('viewerCount reads numbers with thousands separators', () => {
  assert.equal(viewerCount('3 513 tittare'), 3513);
  assert.equal(viewerCount('3 513 tittare'), 3513);
});

test('viewerCount reads abbreviated numbers in any locale', () => {
  assert.equal(viewerCount('3.6K watching'), 3600);
  assert.equal(viewerCount('3,6 tn tittare'), 3600);
  assert.equal(viewerCount('1,2 mn'), 1200000);
  assert.equal(viewerCount('1.2M watching'), 1200000);
});

test('viewerCount returns null without a number', () => {
  assert.equal(viewerCount('no digits'), null);
  assert.equal(viewerCount(undefined), null);
});

test('inputToUrl accepts channel ids, handles and bare names', () => {
  assert.equal(inputToUrl('UCabcdefghijklmnopqrstuv'), 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv');
  assert.equal(inputToUrl('@foo'), 'https://www.youtube.com/@foo');
  assert.equal(inputToUrl('foo'), 'https://www.youtube.com/@foo');
});

test('inputToUrl accepts YouTube links', () => {
  assert.equal(inputToUrl('https://youtu.be/abc123'), 'https://www.youtube.com/watch?v=abc123');
  assert.equal(inputToUrl('m.youtube.com/@x'), 'https://www.youtube.com/@x');
  assert.equal(inputToUrl('https://www.youtube.com/watch?v=abc&t=1'), 'https://www.youtube.com/watch?v=abc&t=1');
});

test('inputToUrl only looks up channel and video links', () => {
  assert.equal(inputToUrl('https://www.youtube.com/logout'), null);
  assert.equal(inputToUrl('youtube.com/@x/../logout'), null);
  // Browsers read a backslash as a slash in an address, so this would become /logout.
  assert.equal(inputToUrl('@x\\..\\logout'), null);
  // The browser tidies this to /logout, which is only ever treated as a video id.
  assert.equal(inputToUrl('https://youtu.be/../logout'), 'https://www.youtube.com/watch?v=logout');
  assert.equal(inputToUrl('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/streams'), 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/streams');
  assert.equal(inputToUrl('https://www.youtube.com/live/abc123'), 'https://www.youtube.com/live/abc123');
});

test('Kick channels with a name that isn\'t one are ignored', () => {
  assert.equal(channelPageToLive({ slug: '../logout' }), null);
  assert.equal(followedStreamToLive({ id: 1, channel: { slug: 'a/b' } }), null);
});

test('inputToUrl rejects other hosts and empty input', () => {
  assert.equal(inputToUrl('https://example.com/x'), null);
  assert.equal(inputToUrl(''), null);
  assert.equal(inputToUrl('   '), null);
});

test('extractJson finds the object after the marker, ignoring braces in strings', () => {
  assert.deepEqual(extractJson('var x = {"a":{"b":"}"}};rest', 'x = '), { a: { b: '}' } });
});

test('extractJson returns null for a missing marker or invalid JSON', () => {
  assert.equal(extractJson('nothing', 'x = '), null);
  assert.equal(extractJson('x = {bad}', 'x = '), null);
});

test('compact returns an empty string for null', () => {
  assert.equal(compact(null), '');
});

test('compact shortens thousands', () => {
  assert.equal(compact(999), '999');
  assert.equal(compact(1500), '1.5K');
  assert.equal(compact(3000), '3K');
  assert.equal(compact(12345), '12K');
});

test('compact shortens millions', () => {
  assert.equal(compact(1200000), '1.2M');
  assert.equal(compact(2000000), '2M');
});

const favorites = [{ id: 'twitch:a' }, { id: 'twitch:b' }];
const MINUTE = 60_000;

test('liveChanges only notes who is live on the first check, and after the browser was closed', () => {
  const first = liveChanges(undefined, favorites, { 'twitch:a': ['1'] }, 1000);
  assert.deepEqual(first, { seen: { at: 1000, streams: { 'twitch:a': ['1'], 'twitch:b': [] } }, started: [] });

  const afterGap = liveChanges(first.seen, favorites, { 'twitch:a': ['2'], 'twitch:b': ['3'] }, 1000 + 11 * MINUTE);
  assert.deepEqual(afterGap.started, []);
  assert.deepEqual(afterGap.seen.streams, { 'twitch:a': ['2'], 'twitch:b': ['3'] });
});

test('liveChanges says who started a stream since the last check', () => {
  const seen = { at: 1000, streams: { 'twitch:a': ['1'], 'twitch:b': [] } };
  const { started, seen: next } = liveChanges(seen, favorites, { 'twitch:a': ['1'], 'twitch:b': ['3'] }, 1000 + MINUTE);
  assert.deepEqual(started, ['twitch:b']);
  assert.deepEqual(next, { at: 1000 + MINUTE, streams: { 'twitch:a': ['1'], 'twitch:b': ['3'] } });
});

test('liveChanges notifies once for a stream that drops out and comes back', () => {
  const live = { at: 1000, streams: { 'twitch:a': ['1'], 'twitch:b': [] } };
  const gone = liveChanges(live, favorites, {}, 1000 + MINUTE);
  assert.deepEqual(gone.started, []);
  assert.deepEqual(gone.seen.streams['twitch:a'], ['1'], 'its last stream is remembered while it is offline');
  assert.deepEqual(liveChanges(gone.seen, favorites, { 'twitch:a': ['1'] }, 1000 + 2 * MINUTE).started, []);
  assert.deepEqual(liveChanges(gone.seen, favorites, { 'twitch:a': ['2'] }, 1000 + 2 * MINUTE).started, ['twitch:a']);
});

test('liveChanges treats a channel with several streams as live once', () => {
  const seen = { at: 1000, streams: { 'twitch:a': ['1', '2'], 'twitch:b': [] } };
  assert.deepEqual(liveChanges(seen, favorites, { 'twitch:a': ['2', '3'] }, 1000 + MINUTE).started, []);
  assert.deepEqual(liveChanges(seen, favorites, { 'twitch:a': ['3'] }, 1000 + MINUTE).started, ['twitch:a']);
});

test('liveChanges only notes a channel that is new to Favorites, and forgets one that left', () => {
  const seen = { at: 1000, streams: { 'twitch:gone': ['9'] } };
  const { started, seen: next } = liveChanges(seen, favorites, { 'twitch:a': ['1'] }, 1000 + MINUTE);
  assert.deepEqual(started, []);
  assert.deepEqual(next.streams, { 'twitch:a': ['1'], 'twitch:b': [] });
});

test('streamAddress is where the channel opens on Twitch', () => {
  assert.equal(streamAddress({ id: 'twitch:kaicenat', platform: 'twitch', login: 'kaicenat' }), 'https://www.twitch.tv/kaicenat');
  assert.equal(streamAddress({ id: 'kick:Some-Name', platform: 'kick', slug: 'Some-Name' }), 'https://www.twitch.tv/kick/some-name');
  assert.equal(streamAddress({ id: 'UCabc', handle: '@Some Channel' }), 'https://www.twitch.tv/yt/some%20channel');
  assert.equal(streamAddress({ id: 'UCabc' }), 'https://www.twitch.tv/yt/ucabc');
});

test('notificationFor says who is live, where and with what', () => {
  assert.deepEqual(notificationFor({ name: 'kai', platform: 'twitch' }, { name: 'Kai', title: ' Hello\n  there ', category: 'Just Chatting' }), {
    title: 'Kai is live on Twitch',
    message: 'Hello there',
    contextMessage: 'Just Chatting',
  });
  // The message can't be empty, so the category or a plain line stands in for a missing title.
  assert.deepEqual(notificationFor({ name: 'KC', platform: 'kick' }, { title: '', category: 'Slots' }), {
    title: 'KC is live on Kick',
    message: 'Slots',
    contextMessage: '',
  });
  assert.deepEqual(notificationFor({ name: 'Some Channel' }, {}), {
    title: 'Some Channel is live on YouTube',
    message: 'Streaming now',
    contextMessage: '',
  });
});

test('twitchLiveFrom keeps only the channels that are live', () => {
  const live = twitchLiveFrom([
    { login: 'on', displayName: 'On', stream: { id: '42', title: 'Hi', game: { displayName: 'Chess' } } },
    { login: 'nogame', displayName: 'NoGame', stream: { id: '43', title: null, game: null } },
    { login: 'off', displayName: 'Off', stream: null },
    null,
  ]);
  assert.deepEqual(live, {
    'twitch:on': { ids: ['42'], name: 'On', title: 'Hi', category: 'Chess' },
    'twitch:nogame': { ids: ['43'], name: 'NoGame', title: '', category: '' },
  });
  assert.deepEqual(twitchLiveFrom(null), {});
});

test('notificationId is new each time and still says what to open', () => {
  const address = 'https://www.twitch.tv/yt/some%20channel';
  const id = notificationId(1000, address);
  assert.notEqual(id, notificationId(1001, address));
  assert.equal(notificationAddress(id), address);
  assert.equal(notificationAddress(notificationId(1000, 'https://www.twitch.tv/kick/a:b')), 'https://www.twitch.tv/kick/a:b');
  // Another extension's, and ones that could open anything but Twitch.
  for (const other of ['someone-elses', 'test', 'live:1000:', 'live:1000:https://example.com/', 'live:x:https://www.twitch.tv/a', 'live:https://www.twitch.tv/a']) {
    assert.equal(notificationAddress(other), null, other);
  }
});

test('isSamePage finds a tab that is already on the stream', () => {
  const address = 'https://www.twitch.tv/kaicenat';
  assert.ok(isSamePage('https://www.twitch.tv/KaiCenat', address));
  assert.ok(isSamePage('https://www.twitch.tv/kaicenat/?referrer=raid#x', address));
  assert.ok(!isSamePage('https://www.twitch.tv/kaicenat/videos', address));
  assert.ok(!isSamePage('https://www.twitch.tv/kai', address));
  assert.ok(!isSamePage('https://m.twitch.tv/kaicenat', address));
  assert.ok(!isSamePage(undefined, address));
});

const changelogContext = { skek: {} };
vm.runInNewContext(readFileSync(new URL('../src/settings-window/changelog.js', import.meta.url), 'utf8'), changelogContext);
const { parseChangelog, boldParts } = changelogContext.skek.changelog;

test('parseChangelog reads each version, its day and its changes', () => {
  const versions = plain(parseChangelog([
    '# Changelog',
    '',
    'An introduction.',
    '- A line before any version.',
    '<!-- A note for whoever edits it. -->',
    '',
    '## 1.2.0 - 2026-11-06',
    '',
    '- **Favorites:** keep channels together.',
    '- A change that goes on',
    '  over a second line.',
    '* A star works as a dash does.',
    '',
    '## [1.1.0] - 2026-11-05',
    '- **Fixed:** something.',
    '',
    '## 1.0.0',
    '- The first version.',
  ].join('\r\n')));
  assert.deepEqual(versions, [
    { version: '1.2.0', date: '2026-11-06', changes: ['**Favorites:** keep channels together.', 'A change that goes on over a second line.', 'A star works as a dash does.'] },
    { version: '1.1.0', date: '2026-11-05', changes: ['**Fixed:** something.'] },
    { version: '1.0.0', date: null, changes: ['The first version.'] },
  ]);
});

test('parseChangelog leaves out what is not a version with changes', () => {
  assert.deepEqual(plain(parseChangelog('')), []);
  assert.deepEqual(plain(parseChangelog('## 1.0.0 - 2026-11-05\n\nNothing listed.\n')), []);
  // A heading that isn't a version ends the one before it.
  const versions = plain(parseChangelog('## 1.0.0\n- One.\n## Notes\n- Not a change.\n### Smaller\n- Nor this.'));
  assert.deepEqual(versions, [{ version: '1.0.0', date: null, changes: ['One.'] }]);
});

test('boldParts splits a change where ** is', () => {
  assert.deepEqual(plain(boldParts('**Favorites:** keep **all** together.')), [
    { text: 'Favorites:', bold: true },
    { text: ' keep ', bold: false },
    { text: 'all', bold: true },
    { text: ' together.', bold: false },
  ]);
  assert.deepEqual(plain(boldParts('Plain <b>text</b>, with one ** left over.')), [{ text: 'Plain <b>text</b>, with one ** left over.', bold: false }]);
});
