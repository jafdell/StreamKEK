// Checks that the project's files point at each other correctly. There's no build step to catch a
// wrong path, and a bad import stops the whole service worker with nothing on the page to show it.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

import { messageHandlers as kickHandlers } from '../src/features/kick-live/background/index.js';
import { messageHandlers as youtubeHandlers } from '../src/features/youtube-live/background/index.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const manifest = JSON.parse(read('manifest.json'));

function filesIn(dir) {
  return readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
}

const context = {};
vm.runInNewContext(read('src/settings.js'), context);
const settingKeys = new Set(context.skek.SETTINGS.map((setting) => setting.key));

test('every file the manifest names exists', () => {
  const named = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])]),
    ...manifest.web_accessible_resources.flatMap((entry) => entry.resources),
    ...manifest.declarative_net_request.rule_resources.map((ruleset) => ruleset.path),
  ];
  for (const path of named) assert.ok(exists(path), `${path} is in manifest.json but doesn't exist`);
});

test('every script and stylesheet is loaded by something', () => {
  const pages = filesIn('src').filter((path) => path.endsWith('.html'));
  const named = new Set(
    [
      manifest.background.service_worker,
      ...manifest.content_scripts.flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])]),
    ],
  );
  const pageText = pages.map(read).join('\n');
  for (const path of filesIn('src')) {
    if (!/\.(js|css)$/.test(path) || named.has(path)) continue;
    const name = path.split('/').pop();
    // Background modules are reached through imports, which the next test follows.
    if (path.includes('/background/') || pageText.includes(name)) continue;
    assert.fail(`${path} isn't loaded by manifest.json or a page`);
  }
});

test('every relative import in the background code exists', () => {
  const modules = filesIn('src').filter((path) => path.includes('/background/') && path.endsWith('.js'));
  for (const path of modules) {
    for (const [, target] of read(path).matchAll(/from '(\.[^']+)'/g)) {
      const resolved = new URL(target, new URL(`../${path}`, import.meta.url));
      assert.ok(existsSync(resolved), `${path} imports ${target}, which doesn't exist`);
    }
  }
});

test('every script and stylesheet a page links exists', () => {
  for (const page of filesIn('src').filter((path) => path.endsWith('.html'))) {
    for (const [, target] of read(page).matchAll(/(?:src|href)="(\.[^"]+)"/g)) {
      const resolved = new URL(target, new URL(`../${page}`, import.meta.url));
      assert.ok(existsSync(resolved), `${page} links ${target}, which doesn't exist`);
    }
  }
});

test('every setting the CSS uses exists', () => {
  for (const path of filesIn('src').filter((file) => file.endsWith('.css'))) {
    for (const [, key] of read(path).matchAll(/data-skek-on~='(\w+)'/g)) {
      assert.ok(settingKeys.has(key), `${path} uses a setting called ${key}, which isn't in src/settings.js`);
    }
  }
});

test('every setting with a message has a handler', () => {
  const handlers = { ...youtubeHandlers, ...kickHandlers };
  for (const { key, message } of context.skek.SETTINGS) {
    if (message) assert.ok(handlers[message], `${key} sends ${message}, which nothing handles`);
  }
});

test('every message the pages send has a handler', () => {
  const handlers = { ...youtubeHandlers, ...kickHandlers };
  for (const path of filesIn('src').filter((file) => file.endsWith('.js') && !file.includes('/background/'))) {
    for (const [, type] of read(path).matchAll(/type: '((?:youtube|kick)-live:\w+)'/g)) {
      assert.ok(handlers[type], `${path} sends ${type}, which nothing handles`);
    }
  }
});
