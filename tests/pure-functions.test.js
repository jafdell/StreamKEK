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
