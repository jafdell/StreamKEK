# Contributing to StreamKEK

Bugs and feature requests go in issues. To send a change: fork the repo, make a branch, make your change, run `node --test` (you'll need Node), walk the relevant part of [TESTING.md](TESTING.md), and open a pull request saying what you tried. Start its title with a verb that says what changed, and fill in the template.

By opening a pull request, you agree that your contribution is licensed under the project's [LICENSE](LICENSE), and that the owner may also use and license it under other terms, including in paid features.

## How it fits together

- **Service worker** (`src/background/service-worker.js`, feature code in `background/` folders): works out what's live on YouTube and Kick, for all tabs at once, and notifies you when a favorite goes live. It also allows both sites' cookies on Twitch, `rules/youtube-watch-frame.json` lets YouTube's watch page load in a frame, and `sendRequestsAsSite` in `streams/background/site-background.js` lets it read what's live.
- **Twitch page scripts** (the first `content_scripts` entry in `manifest.json`): run in every Twitch tab and share one global, `skek`.
- **Stream view:** the `/yt/<channel>` or `/kick/<channel>` page those scripts draw over Twitch's. It holds two frames from that site, the player and the chat. Twitch's own page stays alive behind it, with its video paused and the address showing `/yt/...` or `/kick/...`, so a Twitch feature's scripts and shortcuts keep running there. Check for `#skek-view` where that matters, as `player/modes.js` does.
- **Frame scripts** (`frames/` folders): load on the site itself too, wherever their manifest entry matches, and switch themselves on only inside those two frames.
- **Page-world scripts** (`"world": "MAIN"` in the manifest): run in the site's own page, to reach things like its player.
- **Extension pages:** the settings window and the channel manager. The manager also opens beside the sidebar's **+** button, called the **+** frame.

They talk through `chrome.storage.local` (settings and what's live), messages to the service worker (asking it to do work), `data-skek-*` attributes on `<html>` (for CSS and page-world scripts), and `postMessage` between the Twitch page and the frames in it. The chat frame also gets its theme and Twitch's font size in its address, because storage would answer too late for its first paint.

## Where do I...?

Features are in `src/features/`. `chat/`, `player/` and `sidebar/` match the settings window's tabs, `browse/` is for Twitch's Browse and category pages, `streams/` holds what every other site shares, and `youtube/` and `kick/` hold what's particular to each. This table lists only what those names wouldn't lead you to.

| To change... | Look in |
| --- | --- |
| Settings | `src/settings.js` (the registry). A CSS-only setting's rule lives with its feature, like `src/features/sidebar/sections.css` |
| Code shared by every feature on Twitch pages | `src/twitch/`: `helpers.js`, `page-sync.js`, `gql.js` (Twitch's own API, and the name and sign-in of whoever is signed in to Twitch), `base.css` |
| The extension's button in Twitch's top bar and the window around the settings page | `src/twitch/settings-button.js` and `.css` |
| What's new in each version | `CHANGELOG.md` in the root, newest version first. `src/settings-window/changelog.js` reads that same file for the settings window's **What's new** category, so keep its shape: a `## 1.5.0 - 2026-11-11` heading, then one `- ` line per change, with `**` around the part to show in bold. Write what people can do now, not how the code changed. `node --test` checks that it starts with the manifest's version |
| The settings page: categories, search, rows, backups. Also the toolbar popup | `src/settings-window/`. `src/extension-pages/` holds what it shares with the channel manager: `page.css` and `page-theme.js` |
| The Theme setting's colors | Twitch's values for each theme, wherever `src/` matches `data-theme` or `data-skek-theme`, plus `READABLE` in `youtube/frames/chat.js` (chatters' name colors). Kick has no light theme, so `kick/frames/chat.css` stays dark |
| Streams from other sites | `src/features/streams/`: `sites.js` (everything that differs per site), `twitch/` (sidebar sections, stream view, address, Following page), `manager/` (channel manager), `frames/` and `background/` (what every site's frames and service worker code share) |
| One site in particular | `src/features/youtube/` and `src/features/kick/`: `background/` (polling, reading the site) and `frames/` (its chat and player) |
| Stream view | `streams/twitch/`: `stream-view.js` (the info bar, opening and closing), `view-frames.js` (the two frames), `view-layouts.js` (theatre, stacked and floating) |
| Chat: font size, timestamps, what sits over chat, deleted messages, 7TV, BTTV and FFZ emotes (`emotes.js`, `chat-box-emotes.js` for the chat box, `emote-picker.js` for its button and `recent-emotes.js` for the emotes you sent last), the latest emote in the chat box (`latest-emote.js`), when you followed a channel (`followed.js`) | `src/features/chat/`. A site's chat is styled in its `frames/chat.css` |
| Blocked and highlighted words | `chat/chat-words.js` and `.css`, for every site's chat, with each site's selectors in `MESSAGES`. Their lists are in `settings-window.js` |
| Stream quality | `player/quality.js` (Twitch, and Twitch's embedded player in multi-stream, which gets the setting from `player/embed-settings.js`), and `frames/watch-start.js` in `youtube/` and `kick/` |
| Theatre, stacked and floating chat modes | `src/features/player/` (Twitch, plus `floating-window.js` and `.css`, which both use) and `streams/twitch/view-layouts.js` and `stream-view.css` (other sites). `streams/frames/layout-keys.js` forwards the shortcuts from inside their frames, and `chat-settings.js` there and each site's `chat.css` make floating chat see-through. Theatre on Twitch is Twitch's own. Stacked and floating exist twice, so change both |
| Audio only | `player/audio-only.js` and `.css` (the button, Alt+A and the label over the player) and `player/audio-only-player.js` (switching Twitch's player, in the page itself). Twitch's player only, not multi-stream, YouTube or Kick |
| Reload player on errors | `player/auto-reload.js`, in the page itself, for Twitch's player and its embedded player in multi-stream, which gets the setting from `player/embed-settings.js`. Twitch's player only, not YouTube or Kick |
| Keep quality in background tabs | `player/background-quality.js`, in the page itself, for Twitch's player and its embedded player in multi-stream, which gets the setting from `player/embed-settings.js`. Twitch's player only: YouTube and Kick weren't looked at |
| Starting the stream when a channel goes live | `player/go-live.js`, which asks Twitch whether the channel is live and reloads the page. It keeps its last reload in the tab's `sessionStorage` as `skek-go-live`, to stop after three. When Twitch starts the stream at the top of Home by itself, it clicks Twitch's "Watch now" link there instead, for the normal view. Twitch's own pages only, not YouTube or Kick |
| A button in Twitch's player controls | `player/control-buttons.js`, which `modes.js` and `audio-only.js` both add theirs with |
| Remembering the sort order on Browse, live channels and category pages | `browse/sort-order.js`. It has no setting, and keeps your picks in Twitch's own `localStorage` as `skek-sort-orders`, the one thing not in `chrome.storage.local`, because it has to be read before Twitch's page starts |
| Sidebar previews | `sidebar/preview.js` (Twitch channels) and `streams/twitch/stream-tip.js` (other sites) |
| Favorites | `streams/twitch/favorites.js` and `.css`. Twitch's channels there are read from Twitch's own API in the page, not from `sites.js` |
| Go-live notifications | `notifications/background/`: `index.js` (the checks and the notification), `live-changes.js` (what counts as going live) and `twitch-live.js` (asking Twitch, which the page does itself in `favorites.js`). `pollIfWanted` in `streams/background/site-background.js` keeps YouTube's and Kick's checks running with no Twitch tab while a favorite there needs them |
| Dragging a channel from the sidebar | `streams/twitch/sidebar-drag.js`, which Favorites and multi-stream each register a drop target with |
| Multi-stream | `streams/twitch/multi-view.js` and `.css`, with its sizes and address in `multi-layout.js`, and `routes.js` for going in and out of it. `streams/frames/audio.js` mutes the frames. It's a view of its own, not a mode of the stream view, and its frames never move in the page, since that would reload them. Twitch's streams there use Twitch's embedded player and chat, through its entry in `sites.js` |
| Tests | `tests/`, and `TESTING.md` for what to check by hand |

## Development setup

- Load unpacked from the repo root. There's no build step and there are no runtime dependencies; please open an issue before adding either.
- **Use the Reload button on the extensions page.** Remove and Load unpacked is an uninstall and wipes `chrome.storage.local`. Moving the folder changes the extension ID, which has the same effect. Reload open Twitch tabs after reloading the extension.
- After a reload, check the extensions page for service worker errors. A bad import stops the whole worker. `node --test` also loads the background code and Twitch's page scripts, which catches a bad import or a file loaded in the wrong order, but says nothing about how they behave.
- Run tests with plain `node --test`, not `node --test tests/`.
- **Debugging:** Twitch page and page-world scripts log to the Twitch tab's console. Frame scripts log there too, once you pick the frame in the console's context dropdown. The service worker has its own console, linked from the extensions page.

## Add a setting

1. Add one entry to `SETTINGS` in `src/settings.js`: its `key`, `category`, `label`, `hint` and `default`. Its row in the settings window, its searchability and its storage default now exist. Reuse an existing category where one fits; a new name adds a new category to the left column (give it an icon in `CATEGORY_ICONS` in `src/settings-window/settings-window.js`, or it gets a plain dot).
2. Add a rule starting `html[data-skek-on~='yourKey']` to a CSS file in the first `content_scripts` entry of the manifest, usually your feature's. Prefer this to JS: it can't flash when Twitch re-renders. A rule that hides something should fail safe: add a `:not()` so a Twitch markup change can't hide more than you meant, as `sidebar/sections.css` does. `data-skek-on` exists only on Twitch's top page. In a frame, have its script read the setting and put its own attribute on the frame's `<html>`, then gate the CSS on that, as `youtube/frames/chat.js` does with `data-skek-theme`.
3. Add it to the feature list in `README.md`, and to `TESTING.md` if it needs its own check.

If it needs JS instead of CSS:

```js
chrome.storage.local.get(skek.settingDefaults).then(({ yourKey }) => { /* ... */ });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.yourKey) { /* changes.yourKey.newValue ?? skek.settingDefaults.yourKey */ }
});
```

Code that only asks whether it's on right now can use `document.documentElement.matches("[data-skek-on~='yourKey']")`, as `chat/claim-points.js` does.

If the background has work to do when it changes, add `message: '<name>:doThing'` to the entry and handle that message in the feature's `messageHandlers` (see `showSubscriptions`). The settings window then sends `{ type, enabled }` instead of writing storage, and your handler writes the key. This only works on on/off switches: dropdowns and `choices` always write storage. A dropdown or `choices` setting with background work picks up the change with `chrome.storage.onChanged` in `startBackground`.

To pick one value from a few rather than switch something on or off, give the entry `choices: [{ value, label }, ...]` and a `default` that is one of the values, as `theme` does. Values are strings, even for numbers (`String(px)`). Add `dropdown: true` if there are too many for buttons, as `chatFontSize` does. Its value isn't added to `data-skek-on`, so read it from storage or put it on `<html>` in `src/twitch/page-sync.js`.

## Add a site

Sites like YouTube and Kick share everything on Twitch's side, so a new one is mostly its own reading of what's live:

1. Add an entry to `src/features/streams/sites.js`. Its comments say what each part is for, and `node --test` checks it's complete.
2. Create `src/features/<site>/background/`: a `runPoll` that saves live streams in the entry's storage keys, passed to `createSiteBackground` in `streams/background/site-background.js`, and an `index.js` wired up in `src/background/service-worker.js`. Add its keys to the table below, and its handlers and keys to `tests/project-wiring.test.js`.
3. Create `src/features/<site>/frames/` for its player and chat, loading `streams/frames/` beside them in the manifest. Add the site's host to `host_permissions`.
4. Add settings entries for its switch, in a category named after the site with an icon in `CATEGORY_ICONS`, and for showing its section, with a rule in `streams/twitch/sidebar.css`. Add its icon to `ICONS` in `src/twitch/helpers.js` and a `skek-button--<platform>` colour in `streams/twitch/stream-view.css`.

## Add a feature

1. Put it where it belongs. A small feature for Twitch's chat, player or sidebar is a file or two in `src/features/chat/`, `player/` or `sidebar/`, named for what it does, like `player/modes.js` and `.css`. Anything bigger gets `src/features/<name>/`, with folders only as needed: `twitch/` for page scripts and CSS, `frames/` for scripts inside other sites' frames, `background/` or a page of its own.

   A feature that also changes the stream view can't live in one place: the Twitch part goes in the feature's file and the stream view part in `streams/` or a site's folder, each with a comment pointing to the other, as `player/quality.js` and `watch-start.js` have.
2. List its files in the first `content_scripts` entry of `manifest.json`: JS after `streams/twitch/main.js`, CSS with the other features' CSS, before the `streams` files. Keep the `streams/twitch/` entries in order: each file destructures from the ones before it. A new file there goes after what it destructures and before `main.js`.

   Some files are set up differently:
   - A frame script gets a manifest entry of its own with `all_frames`, as each site's `chat.js` and `watch.js` have. The entry also matches that site's normal pages, so the script's first line returns unless it's framed on Twitch (`if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;`), page-world scripts included. A site's `watch.js` checks the top of the frame chain instead, so a frame in between can't bring back the full signed-in page. Its CSS is scoped to something the script puts on `<html>`, like `html.skek-watch` or `html[data-skek-kick-watch]`. Use an attribute if the site's page might reset `<html>`'s classes.
   - A page-world script gets one with `"world": "MAIN"`, as `player/quality.js` and `watch-start.js` have. It has no `chrome.*` or `skek`, so give it what it needs as an attribute on `<html>`, set by a normal script, like `data-skek-quality`.
   - Any extension file a site's page loads needs a `web_accessible_resources` entry: a framed page like `manager.html`, an image like `icons/48.png`, a font like `fonts/inter-latin.woff2`.
   - A page of its own links `src/extension-pages/page.css` and loads `src/settings.js`, then `src/extension-pages/page-theme.js`, as `manager.html` does, which also loads `streams/sites.js` to know the sites. `page.css` keeps the body hidden until `page-theme.js` has run.
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
   - A multi-file feature adds a `skek.<name>` object, as `skek.streams` does. Destructure what loads earlier at the top, and call everything else as `skek.<name>.fn()` at call time (the files in `streams/twitch/` alias it: `const shared = skek.streams;`).
   - Frame and page-world scripts are wrapped too, as `chat.js` and `watch-start.js` are: a frame script shares its world with the other scripts in that frame, and anything declared outside a page-world script becomes a global on the site's own page. `skek.helpers` exists only on Twitch pages.
   - Anything that reads a setting's default takes it from `skek.settingDefaults` rather than repeating the value; a frame script lists `src/settings.js` before it in the manifest to get it. The service worker has no `skek`, so background code repeats the default, as each site's `poller.js` does: keep them equal.
4. For a setting, add it as described above.
5. For background work, add `src/features/<name>/background/index.js` exporting `messageHandlers` and `startBackground`. Add one import, one spread and one call in `src/background/service-worker.js`. Prefix message types and alarm names with the feature's name, `<name>:doThing`, so features can't clash. The two sites keep the names they were released with, `youtube-live:` and `kick-live:`. Don't add a second `onMessage` listener. No top-level await, dynamic import, or top-level `chrome.*` outside `service-worker.js`.

   `startBackground` runs every time the worker wakes, not once, and the worker can stop between events. Register its listeners synchronously, keep state in storage rather than in variables, and don't recreate what already exists (see the alarm in `streams/background/site-background.js`). A handler takes `(msg)` and returns `{ ok: true, ... }`; anything it throws reaches the sender as `{ ok: false, error }`. Twitch pages send with `skek.helpers.send`.
6. For something in the settings window that isn't a switch or a choice, add an entry to `CUSTOM_ITEMS` in `src/settings-window/settings-window.js`: its `category`, `label`, `hint` and a `build` function returning what goes under the label, or an `href` to make the row a link. It's searchable like a setting. `skek.helpers` isn't available on that page. Anything bigger should be its own page in a frame, as `channelManagerFrame` does with `manager.html`.
7. Add any storage key that isn't in `SETTINGS`, and any setting with a `message`, to the table below. Name a key so it can't clash with another feature's, like `floatingChat`. Each key is written from one context, the background or one kind of page, never both: writers rewrite whole values, as `runPoll` does, so a second one loses updates. Restoring a backup is the one exception. Add the key to `KEY_DEFAULTS` and `CLEANERS` in `src/settings-window/backup.js`, or to `NOT_BACKED_UP` if it can be worked out again.
8. Add it to the feature list in `README.md`, what to check to `TESTING.md`, and a row to "Where do I...?" if it spans folders.
9. Give any pure function a test in `tests/`: background modules import directly, which is why they can't touch `chrome.*` at load, and a content script runs through `vm` with a stub `skek`, as `format.js` does. Then run `node --test`, reload the extension and walk the relevant part of `TESTING.md`.

## Rules

- Everything added to Twitch's page starts with `skek`: classes, ids, `data-skek-*` attributes, `--skek-*` custom properties and keyframes. Extension pages (settings window, manager) have their own document and don't need the prefix. `x.js` sits next to `x.css`.
- To recognise Twitch elements, prefer `data-a-target`, `data-test-selector` or `href`, and fall back to Twitch's class names (`.side-nav-section`) only where no attribute exists. Don't use `aria-label` or visible text, which are translated, unless nothing else tells two things apart. Then match only a name that stays the same, and make a miss harmless, as the Kappa Train rule in `chat/sections.css` does. Check a selector on a live channel before relying on it. Never use generated class names like `Layout-sc-...`, and match hashed ones by prefix, like `[class*='chatCard--']`. `:has()` is fine, given the manifest's `minimum_chrome_version`.
- Reach into a site's internals, like Twitch's player through React or YouTube's `movie_player`, only when nothing else can do the job, and make it do nothing if they change. `player/quality.js` and `kick/frames/watch-start.js` are the examples.
- Never rename a storage key after release. Nothing migrates old keys by itself, so users would lose that value. The one exception is `src/background/renamed-settings.js`, which carries the old hide settings for YouTube Live and Kick Live over to their show settings.
- Use `innerHTML` only with constants from the code, never with text from a page or a stream.
- A `message` listener checks `event.source` before trusting what it receives, as `view-layouts.js` does.
- Don't add a script loader, a router or other shared machinery until a second feature really needs it. Code moves to `src/twitch/` when a second feature needs it. The stream view's half of a feature doesn't count: `view-layouts.js` uses `player/floating-window.js` because floating chat is one feature on two players.
- New permissions need a stated reason in the PR.
- Leave `version` in `manifest.json` alone; the maintainer sets it, and adds that version to `CHANGELOG.md`.
- Don't lower `minimum_chrome_version` below 145. The `topDomains` limit in `rules/youtube-watch-frame.json` only exists from Chrome 145.
- Test YouTube's player in a real browser before tightening `rules/youtube-watch-frame.json`. Its `initiatorDomains` limit is fine alone, but adding it and narrowing `topDomains` to `www.twitch.tv`, tried together, made the browser refuse the player.

## Storage keys

All in `chrome.storage.local`. A key in `SETTINGS` is written by the settings window, so it's listed here only if it has a `message`. Everything else:

| Key | Shape | Written by |
| --- | --- | --- |
| `channels` | `[{id,name,handle,avatar}]` | background |
| `subChannels` | `{[id]:{id,name,handle,avatar}}` | background |
| `hiddenChannels` | `{[id]:{id,name,handle,avatar}}` | background |
| `live` | see the comment at the top of `src/features/youtube/background/poller.js` | background |
| `status` | `{checkedAt,consentRequired,signedOut}` | background |
| `showSubscriptions` | boolean, default true | background |
| `kickChannels` | `[{id,platform,slug,name,handle,avatar}]` | background |
| `kickFollowed`, `kickHidden` | `{[id]:{id,platform,slug,name,handle,avatar}}` | background |
| `kickLive` | like `live`, and each stream also has `thumbnail` | background |
| `kickStatus` | `{checkedAt,signedOut,failed}` | background |
| `showKickFollows` | boolean, default true | background |
| `liveNotificationsSeen` | `{[platform]:{at,streams:{[id]:[streamId]}}}`: each favorite's last known streams, by site | background |
| `kickVolume` | number above 0, up to 1, default 1 | Kick's player frame |
| `favoriteChannels` | `[{id,platform,slug,login,name,handle,avatar}]`, in your order. Fields as that site's channels have them; Twitch's have `login` and the id `twitch:<login>` | Twitch page |
| `chatHidden` | boolean | Twitch page |
| `chatBlockedWords`, `chatHighlightedWords` | `[string]`, default empty | settings window |
| `floatingChat` | `{x,y,width,height,opacity}`, each optional | Twitch page |
| `recentEmotes` | `[{name,twitch}]`, the last emotes you sent in Twitch's chat, newest first. `twitch` is the emote's id, only on Twitch's own | Twitch page |
