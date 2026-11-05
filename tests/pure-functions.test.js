// Tests for the pure functions that parse YouTube's pages and format numbers.
// Run with plain `node --test` from the repo root.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

import { extractJson } from '../src/features/youtube/background/youtube-pages.js';
import { viewerCount } from '../src/features/youtube/background/streams.js';
import { inputToUrl } from '../src/features/youtube/background/channels.js';
import { liveChannelsFromGuide } from '../src/features/youtube/background/subscriptions.js';
import { channelPageToLive, followedStreamToLive, slugFromInput, startedAtIso } from '../src/features/kick/background/kick-api.js';

// format.js is a classic content script, so it runs in a context holding the globals it expects.
const context = { skek: { helpers: { el() {} }, streams: {} } };
vm.runInNewContext(readFileSync(new URL('../src/features/streams/twitch/format.js', import.meta.url), 'utf8'), context);
const { compact, thumbnailUrl } = context.skek.streams;

test('thumbnailUrl points at the stream and escapes its id', () => {
  assert.equal(thumbnailUrl('abc_-1'), 'https://i.ytimg.com/vi/abc_-1/hqdefault_live.jpg');
  assert.equal(thumbnailUrl('a/b'), 'https://i.ytimg.com/vi/a%2Fb/hqdefault_live.jpg');
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
