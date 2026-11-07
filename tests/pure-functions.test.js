// Tests for the pure functions that parse YouTube's pages and format numbers.
// Run with plain `node --test` from the repo root.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

import { extractJson } from '../src/features/youtube/background/youtube-pages.js';
import { viewerCount } from '../src/features/youtube/background/live-entry.js';
import { inputToUrl } from '../src/features/youtube/background/channels.js';
import { liveChannelsFromGuide } from '../src/features/youtube/background/subscriptions.js';
import { flippedSettings } from '../src/background/renamed-settings.js';
import { channelPageToLive, followedStreamToLive, slugFromInput, startedAtIso } from '../src/features/kick/background/kick-api.js';
import { copyExpiry, isRealCookie } from '../src/features/kick/background/twitch-frame-cookies.js';

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
const { channelFromPath, videoFromPath, chatBoxAddition, sevenTvEmotes, bttvEmotes, ffzEmotes, ffzGlobalSets, mergeEmotes, messageParts, loadLists, allLoaded } = chatEmotesContext.skek.chatEmotes;
const names = (emotes) => plain(emotes.map((emote) => emote.name));

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

test('chatBoxAddition keeps an emote apart from what is already in the chat box', () => {
  assert.equal(chatBoxAddition('', 'KEKW'), 'KEKW');
  assert.equal(chatBoxAddition('FEFF', 'KEKW'), 'KEKW');
  assert.equal(chatBoxAddition('hello', 'KEKW'), ' KEKW');
  assert.equal(chatBoxAddition('hello ', 'KEKW'), 'KEKW');
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

test('multiLayout survives having no room at all, as before the page has laid out', () => {
  assert.equal(multiLayout({ count: 3, width: 0, height: 0, chat: true }).players.length, 3);
});

test('multiLayout makes the first of three streams the biggest', () => {
  const { players } = plain(multiLayout({ count: 3, width: 1260, height: 900, chat: false }));
  assert.ok(players[0].w > players[1].w);
  assert.equal(players[1].w, players[2].w);
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

test('Twitch frames name this page as their parent, in the theme chosen', () => {
  sitesContext.location = { hostname: 'www.twitch.tv' };
  const urls = siteOf({ platform: 'twitch' }).frameUrls({ login: 'a' }, null, '#skek-theme=dark');
  assert.equal(urls.player, 'https://player.twitch.tv/?channel=a&parent=www.twitch.tv');
  assert.equal(urls.chat, 'https://www.twitch.tv/embed/a/chat?parent=www.twitch.tv&darkpopout#skek-theme=dark');
  const light = siteOf({ platform: 'twitch' }).frameUrls({ login: 'a' }, null, '#skek-theme=light');
  assert.equal(light.chat, 'https://www.twitch.tv/embed/a/chat?parent=www.twitch.tv#skek-theme=light');
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
