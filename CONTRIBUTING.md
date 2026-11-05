# Contributing to StreamKEK

Bugs and feature requests go in issues. To send a change: fork the repo, make a branch, make your change, run `node --test` (you'll need Node), walk the relevant part of [TESTING.md](TESTING.md), and open a pull request saying what you tried.

## How it fits together

- **Service worker** (`src/background/service-worker.js`, feature code in `background/` folders): works out what's live on YouTube and Kick, for all tabs at once. It also allows both sites' cookies on Twitch, `rules/youtube-watch-frame.json` lets YouTube's watch page load in a frame, and `rules/youtube-guide-origin.json` and `rules/kick-api-origin.json` let it read what's live.
- **Twitch page scripts** (the first `content_scripts` entry in `manifest.json`): run in every Twitch tab and share one global, `skek`.
- **Stream view:** the `/yt/<channel>` page those scripts draw over Twitch's. It holds two YouTube frames, the player and the chat. Twitch's own page stays alive behind it, with its video paused and the address showing `/yt/...`, so a Twitch feature's scripts and shortcuts keep running there. Check for `#skek-view` where that matters, as `player-modes.js` does.
- **Frame scripts** (`frames/` folders): load on YouTube itself too, wherever their manifest entry matches, and switch themselves on only inside those two frames.
- **Page-world scripts** (`"world": "MAIN"` in the manifest): run in the site's own page, to reach things like its player.
- **Extension pages:** the settings window and the channel manager. The manager also opens beside the sidebar's **+** button, called the **+** frame.

They talk through `chrome.storage.local` (settings and what's live), messages to the service worker (asking it to do work), `data-skek-*` attributes on `<html>` (for CSS and page-world scripts), and `postMessage` between the Twitch page and the frames in it. The chat frame also gets its theme and Twitch's font size in its address, because storage would answer too late for its first paint.

## Where do I...?

Each feature is a folder in `src/features/`. This table lists only what its name wouldn't lead you to.

| To change... | Look in |
| --- | --- |
| Settings | `src/settings.js` (the registry). A CSS-only setting's rule lives with its feature, like `src/features/sidebar-sections/sidebar-sections.css` |
| Code shared by every feature on Twitch pages | `src/twitch/`: `helpers.js`, `page-sync.js`, `base.css` |
| The extension's button in Twitch's top bar and the window around the settings page | `src/twitch/settings-button.js` and `.css` |
| The settings page: categories, search, rows. Also the toolbar popup | `src/settings-window/`. `src/shared/` holds what it shares with the channel manager: `page.css` and `page-theme.js` |
| The Theme setting's colors | Twitch's values for each theme, wherever `src/` matches `data-theme` or `data-skek-theme`, plus `READABLE` in `youtube-live/frames/chat.js` (chatters' name colors) |
| YouTube Live | `src/features/youtube-live/`: `background/` (polling, reading YouTube pages), `twitch/` (sidebar, stream view, address, Following page), `frames/` (chat, player), `manager/` (channel manager) |
| Kick Live | `src/features/kick-live/`: `background/` (polling, Kick's API) and `frames/` (chat, player). Its sidebar section, stream view, address and Following page share YouTube Live's code in `youtube-live/twitch/`, where `SITES` in `format.js` holds what differs, and its channels are in `youtube-live/manager/` |
| Chat: font size, timestamps, what sits over chat | `src/features/chat-font-size/`, `chat-timestamps/`, `chat-sections/`. YouTube's chat is styled in `youtube-live/frames/chat.css` |
| Stream quality | `src/features/stream-quality/` (Twitch) and `youtube-live/frames/watch-start.js` (YouTube) |
| Theatre, stacked and floating chat modes | `src/features/player-modes/` (Twitch, plus `floating-window.js` and `.css`, which both use) and `youtube-live/twitch/player-view.js` and `.css` (YouTube). `frames/layout-keys.js` forwards the shortcuts from inside YouTube's frames, and `frames/chat.js` and `.css` make floating chat see-through. Theatre on Twitch is Twitch's own. Stacked and floating exist twice, so change both |
| Sidebar previews | `src/features/sidebar-preview/` (Twitch channels) and `youtube-live/twitch/stream-tip.js` (YouTube channels) |
| Tests | `tests/`, and `TESTING.md` for what to check by hand |

## Development setup

- Load unpacked from the repo root. There's no build step and there are no runtime dependencies; please open an issue before adding either.
- **Use the Reload button on the extensions page.** Remove and Load unpacked is an uninstall and wipes `chrome.storage.local`. Moving the folder changes the extension ID, which has the same effect. Reload open Twitch tabs after reloading the extension.
- After a reload, check the extensions page for service worker errors. A bad import stops the whole worker. After background changes, also run `node -e "import('./src/features/youtube-live/background/index.js');import('./src/features/kick-live/background/index.js')"`, because the tests don't load those files or their `poller.js`.
- Run tests with plain `node --test`, not `node --test tests/`.
- **Debugging:** Twitch page and page-world scripts log to the Twitch tab's console. Frame scripts log there too, once you pick the frame in the console's context dropdown. The service worker has its own console, linked from the extensions page.

## Add a setting

1. Add one entry to `SETTINGS` in `src/settings.js`: its `key`, `category`, `label`, `hint` and `default`. Its row in the settings window, its searchability and its storage default now exist. Reuse an existing category where one fits; a new name adds a new category to the left column (give it an icon in `CATEGORY_ICONS` in `src/settings-window/settings-window.js`, or it gets a plain dot).
2. Add a rule starting `html[data-skek-on~='yourKey']` to a CSS file in the first `content_scripts` entry of the manifest, usually your feature's. Prefer this to JS: it can't flash when Twitch re-renders. A rule that hides something should fail safe: add a `:not()` so a Twitch markup change can't hide more than you meant, as `sidebar-sections.css` does. `data-skek-on` exists only on Twitch's top page. In a frame, have its script read the setting and put its own attribute on the frame's `<html>`, then gate the CSS on that, as `chat.js` does with `data-skek-theme`.
3. Add it to the feature list in `README.md`, and to `TESTING.md` if it needs its own check.

If it needs JS instead of CSS:

```js
chrome.storage.local.get(skek.settingDefaults).then(({ yourKey }) => { /* ... */ });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.yourKey) { /* changes.yourKey.newValue ?? skek.settingDefaults.yourKey */ }
});
```

Code that only asks whether it's on right now can use `document.documentElement.matches("[data-skek-on~='yourKey']")`, as `claim-points.js` does.

If the background has work to do when it changes, add `message: '<name>:doThing'` to the entry and handle that message in the feature's `messageHandlers` (see `showSubscriptions`). The settings window then sends `{ type, enabled }` instead of writing storage, and your handler writes the key. This only works on on/off switches: dropdowns and `choices` always write storage. A dropdown or `choices` setting with background work picks up the change with `chrome.storage.onChanged` in `startBackground`.

To pick one value from a few rather than switch something on or off, give the entry `choices: [{ value, label }, ...]` and a `default` that is one of the values, as `theme` does. Values are strings, even for numbers (`String(px)`). Add `dropdown: true` if there are too many for buttons, as `chatFontSize` does. Its value isn't added to `data-skek-on`, so read it from storage or put it on `<html>` in `src/twitch/page-sync.js`.

## Add a feature

1. Create `src/features/<name>/`. Folders only as needed: `twitch/` for page scripts and CSS, `frames/` for scripts inside other sites' frames, `background/` or a page of its own. A small feature keeps its files flat, named after it, like `player-modes/player-modes.js` and `.css`. A CSS-only feature is a single file, like `sidebar-sections`.

   A feature that also changes the YouTube stream view can't live in one folder: the Twitch part goes in the feature's folder and the stream view part in `youtube-live/`, each with a comment pointing to the other, as `stream-quality.js` and `watch-start.js` have.
2. List its files in the first `content_scripts` entry of `manifest.json`: JS after `youtube-live/twitch/main.js`, CSS with the other features' CSS, before the `youtube-live` files. Keep the `youtube-live/twitch/` entries in order: each file destructures from the ones before it. A new YouTube Live file goes among them, after what it destructures and before `main.js`.

   Some files are set up differently:
   - A frame script gets a manifest entry of its own with `all_frames`, as `chat.js` and `watch.js` have. The entry also matches normal YouTube pages, so the script's first line returns unless it's framed on Twitch (`if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;`), page-world scripts included, and its CSS is scoped to a class the script puts on `<html>`, like `html.skek-watch`.
   - A page-world script gets one with `"world": "MAIN"`, as `stream-quality.js` and `watch-start.js` have. It has no `chrome.*` or `skek`, so give it what it needs as an attribute on `<html>`, set by a normal script, like `data-skek-quality`.
   - Any extension file a Twitch or YouTube page loads needs a `web_accessible_resources` entry: a framed page like `manager.html`, an image like `icons/48.png`, a font like `fonts/inter-latin.woff2`.
   - A page of its own links `src/shared/page.css` and loads `src/settings.js`, then `src/shared/page-theme.js`, as `manager.html` does. `page.css` keeps the body hidden until `page-theme.js` has run.
3. Write each script on Twitch pages in the wrapper:
   ```js
   // What this file is for.
   (() => {
     'use strict';
     const { el, onBodyReady, onPageChange } = skek.helpers;
     function render() { /* add your things if they're missing */ }
     onBodyReady(() => {
       render();
       onPageChange(render); // Twitch re-renders without reloading
     });
   })();
   ```
   - A top-level `const` outside the wrapper shares one scope with every other content script, and a duplicate name is a SyntaxError that kills that whole file.
   - Scripts run at `document_start`, so touch the page only inside `onBodyReady`. Use `onPageChange` rather than your own observer on `<body>`: `render` can run five times a second while chat moves, so it must be cheap and change nothing when nothing has changed (see `signature` in `sidebar.js`).
   - A multi-file feature adds a `skek.<name>` object, as `skek.youtube` does. Destructure what loads earlier at the top, and call everything else as `skek.<name>.fn()` at call time (the YouTube Live files alias it: `const yt = skek.youtube;`).
   - Frame and page-world scripts are wrapped too, as `chat.js` and `watch-start.js` are: a frame script shares its world with the other scripts in that frame, and anything declared outside a page-world script becomes a global on the site's own page. `skek.helpers` exists only on Twitch pages.
   - Anything that reads a setting's default takes it from `skek.settingDefaults` rather than repeating the value; a frame script lists `src/settings.js` before it in the manifest to get it. The service worker has no `skek`, so background code repeats the default, as `poller.js` does: keep them equal.
4. For a setting, add it as described above.
5. For background work, add `src/features/<name>/background/index.js` exporting `messageHandlers` and `startBackground`. Add one import, one spread and one call in `src/background/service-worker.js`. Prefix message types and alarm names with the feature's name, `<name>:doThing`, as `youtube-live:refresh` does, so features can't clash. Don't add a second `onMessage` listener. No top-level await, dynamic import, or top-level `chrome.*` outside `service-worker.js`.

   `startBackground` runs every time the worker wakes, not once, and the worker can stop between events. Register its listeners synchronously, keep state in storage rather than in variables, and don't recreate what already exists (see the alarm in `youtube-live/background/index.js`). A handler takes `(msg)` and returns `{ ok: true, ... }`; anything it throws reaches the sender as `{ ok: false, error }`. Twitch pages send with `skek.helpers.send`.
6. For something in the settings window that isn't a switch or a choice, add an entry to `CUSTOM_ITEMS` in `src/settings-window/settings-window.js`: its `category`, `label`, `hint` and a `build` function returning what goes under the label, or an `href` to make the row a link. It's searchable like a setting. `skek.helpers` isn't available on that page. Anything bigger should be its own page in a frame, as `channelManagerFrame` does with `manager.html`.
7. Add any storage key that isn't in `SETTINGS`, and any setting with a `message`, to the table below. Name a key so it can't clash with another feature's, like `floatingChat`. Each key is written from one context, the background or one kind of page, never both: writers rewrite whole values, as `runPoll` does, so a second one loses updates.
8. Add it to the feature list in `README.md`, what to check to `TESTING.md`, and a row to "Where do I...?" if it spans folders.
9. Give any pure function a test in `tests/`: background modules import directly, which is why they can't touch `chrome.*` at load, and a content script runs through `vm` with a stub `skek`, as `format.js` does. Then run `node --test`, reload the extension and walk the relevant part of `TESTING.md`.

## Rules

- Everything added to Twitch's page starts with `skek`: classes, ids, `data-skek-*` attributes, `--skek-*` custom properties and keyframes. Extension pages (settings window, manager) have their own document and don't need the prefix. `x.js` sits next to `x.css`.
- To recognise Twitch elements, prefer `data-a-target`, `data-test-selector` or `href`, and fall back to Twitch's class names (`.side-nav-section`) only where no attribute exists. Don't use `aria-label` or visible text, which are translated, unless nothing else tells two things apart. Then match only a name that stays the same, and make a miss harmless, as the Kappa Train rule in `chat-sections.css` does. Check a selector on a live channel before relying on it. Never use generated class names like `Layout-sc-...`, and match hashed ones by prefix, like `[class*='chatCard--']`. `:has()` is fine, given the manifest's `minimum_chrome_version`.
- Reach into a site's internals, like Twitch's player through React or YouTube's `movie_player`, only when nothing else can do the job, and make it do nothing if they change. `stream-quality.js` is the example.
- Never rename a storage key after release. Nothing migrates old keys, so users would lose that value.
- Use `innerHTML` only with constants from the code, never with text from a page or a stream.
- A `message` listener checks `event.source` before trusting what it receives, as `player-view.js` does.
- Don't add a script loader, a router or other shared machinery until a second feature really needs it. Code moves to `src/twitch/` when a second feature needs it. The stream view's half of a feature doesn't count: `player-view.js` uses `player-modes/floating-window.js` because floating chat is one feature on two players.
- New permissions need a stated reason in the PR.
- Leave `version` in `manifest.json` alone; the maintainer sets it.
- Don't lower `minimum_chrome_version` below 145. The `topDomains` limit in `rules/youtube-watch-frame.json` only exists from Chrome 145.
- Test YouTube's player in a real browser before tightening `rules/youtube-watch-frame.json`. Adding `initiatorDomains` and narrowing `topDomains` to `www.twitch.tv`, tried together, made the browser refuse the player.

## Storage keys

All in `chrome.storage.local`. A key in `SETTINGS` is written by the settings window, so it's listed here only if it has a `message`. Everything else:

| Key | Shape | Written by |
| --- | --- | --- |
| `channels` | `[{id,name,handle,avatar}]` | background |
| `subChannels` | `{[id]:{id,name,handle,avatar}}` | background |
| `hiddenChannels` | `{[id]:{id,name,handle,avatar}}` | background |
| `live` | see the comment at the top of `src/features/youtube-live/background/poller.js` | background |
| `status` | `{checkedAt,consentRequired,signedOut}` | background |
| `showSubscriptions` | boolean, default true | background |
| `kickChannels` | `[{id,platform,slug,name,handle,avatar}]` | background |
| `kickFollowed`, `kickHidden` | `{[id]:{id,platform,slug,name,handle,avatar}}` | background |
| `kickLive` | like `live`, and each stream also has `thumbnail` | background |
| `kickStatus` | `{checkedAt,signedOut,failed}` | background |
| `showKickFollows` | boolean, default true | background |
| `chatHidden` | boolean | Twitch page |
| `floatingChat` | `{x,y,width,height,opacity}`, each optional | Twitch page |
