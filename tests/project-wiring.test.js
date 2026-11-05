// Checks that the project's files point at each other correctly. There's no build step to catch a
// wrong path, and a bad import stops the whole service worker with nothing on the page to show it.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

import { messageHandlers as kickHandlers } from '../src/features/kick/background/index.js';
import { messageHandlers as youtubeHandlers } from '../src/features/youtube/background/index.js';
import { KEYS as kickKeys } from '../src/features/kick/background/poller.js';
import { KEYS as youtubeKeys } from '../src/features/youtube/background/poller.js';

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
vm.runInNewContext(read('src/features/streams/sites.js'), context);

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

test('every site in sites.js is complete', () => {
  const handlers = { ...youtubeHandlers, ...kickHandlers };
  const seen = new Set();
  for (const [platform, site] of Object.entries(context.skek.sites)) {
    for (const action of ['add', 'remove', 'hide', 'unhide', 'refresh', ...(site.loadsDetails ? ['loadStreamDetails'] : [])]) {
      assert.ok(handlers[`${site.messagePrefix}:${action}`], `${platform} has no handler for ${action}`);
    }
    assert.ok(settingKeys.has(site.followsSetting), `${platform} needs the setting ${site.followsSetting}`);
    for (const field of ['name', 'domain', 'routePrefix', 'placeholder', 'managerHint']) {
      assert.equal(typeof site[field], 'string', `${platform} needs ${field}`);
    }
    for (const field of ['channelUrl', 'streamUrl', 'previewUrl', 'frameUrls']) {
      assert.equal(typeof site[field], 'function', `${platform} needs ${field}`);
    }
    for (const field of ['id', 'title', 'glyph']) assert.ok(site.section?.[field], `${platform} needs section.${field}`);
    for (const field of ['path', 'tabId', 'panelId', 'sectionId', 'sectionTitle']) {
      assert.ok(site.following?.[field], `${platform} needs following.${field}`);
    }
    for (const field of ['own', 'followed', 'live', 'status', 'hidden']) assert.ok(site.keys?.[field], `${platform} needs keys.${field}`);
    assert.ok(read('src/features/streams/twitch/stream-view.css').includes(`.skek-button--${platform}`), `${platform} needs a button colour`);
    assert.ok(read('src/twitch/helpers.js').includes(`${site.section.glyph}: '`), `${platform} needs the icon ${site.section.glyph}`);
    assert.ok(context.skek.SETTINGS.some((setting) => setting.category === site.name), `${platform} needs a settings category`);
    for (const key of Object.values(site.keys)) {
      assert.ok(!seen.has(key), `two sites share the storage key ${key}`);
      seen.add(key);
    }
  }
});

test('saved storage keys keep the names they were released with', () => {
  const { youtube, kick } = context.skek.sites;
  assert.deepEqual({ ...youtube.keys }, { own: 'channels', followed: 'subChannels', live: 'live', status: 'status', hidden: 'hiddenChannels' });
  assert.deepEqual({ ...kick.keys }, { own: 'kickChannels', followed: 'kickFollowed', live: 'kickLive', status: 'kickStatus', hidden: 'kickHidden' });
});

test('the background uses the same storage keys as sites.js', () => {
  assert.deepEqual({ ...context.skek.sites.youtube.keys }, youtubeKeys);
  assert.deepEqual({ ...context.skek.sites.kick.keys }, kickKeys);
});

// Runs Twitch's page scripts in their manifest order, with stubs for the browser. This catches what
// a syntax check can't: a name that doesn't exist, or a file that loads before something it needs.
function loadTwitchScripts() {
  const inert = () => new Proxy(function () {}, {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => '' : inert()),
    apply: () => inert(),
    construct: () => inert(),
  });
  const page = {
    chrome: inert(),
    document: { body: null, documentElement: inert(), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: inert(), addEventListener() {}, removeEventListener() {} },
    location: { pathname: '/', search: '', hash: '', hostname: 'www.twitch.tv', ancestorOrigins: [] },
    history: inert(),
    localStorage: inert(),
    addEventListener() {},
    setInterval() {},
    setTimeout() {},
    clearTimeout() {},
    clearInterval() {},
    MutationObserver: class { observe() {} },
    requestAnimationFrame() {},
    innerWidth: 1000,
    innerHeight: 1000,
    console,
  };
  page.globalThis = page;
  page.window = page;
  vm.createContext(page);
  for (const path of manifest.content_scripts[0].js) vm.runInContext(read(path), page, { filename: path });
  return page;
}

test("Twitch's page scripts load in their manifest order", () => {
  assert.doesNotThrow(loadTwitchScripts);
});

test('everything the streams files use from the shared object exists', () => {
  const { skek } = loadTwitchScripts();
  const files = filesIn('src/features/streams/twitch').filter((path) => path.endsWith('.js'));
  for (const path of files) {
    const text = read(path);
    for (const [, name] of text.matchAll(/\bshared\.(\w+)/g)) {
      assert.ok(name in skek.streams, `${path} uses shared.${name}, which nothing defines`);
    }
    for (const [, names] of text.matchAll(/const \{([^}]+)\} = shared;/g)) {
      for (const name of names.split(',').map((part) => part.trim().split(':')[0].trim())) {
        assert.ok(name in skek.streams, `${path} takes ${name} from shared, which nothing defines`);
      }
    }
  }
});
