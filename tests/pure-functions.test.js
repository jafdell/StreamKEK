// Tests for the pure functions that parse YouTube's pages and format numbers.
// Run with plain `node --test` from the repo root.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

import { extractJson } from '../src/features/youtube-live/background/youtube-pages.js';
import { viewerCount } from '../src/features/youtube-live/background/streams.js';
import { inputToUrl } from '../src/features/youtube-live/background/channels.js';

// format.js is a classic content script, so it runs in a context holding the globals it expects.
const context = { skek: { helpers: { el() {} }, youtube: {} } };
vm.runInNewContext(readFileSync(new URL('../src/features/youtube-live/twitch/format.js', import.meta.url), 'utf8'), context);
const { compact, thumbnailUrl } = context.skek.youtube;

test('thumbnailUrl points at the stream and escapes its id', () => {
  assert.equal(thumbnailUrl('abc_-1'), 'https://i.ytimg.com/vi/abc_-1/hqdefault_live.jpg');
  assert.equal(thumbnailUrl('a/b'), 'https://i.ytimg.com/vi/a%2Fb/hqdefault_live.jpg');
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
