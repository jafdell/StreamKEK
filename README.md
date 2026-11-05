# StreamKEK

StreamKEK gives you more control over watching and chatting on Twitch, and brings YouTube and Kick live streams and their chat there too.

Unofficial: not affiliated with or endorsed by Twitch or YouTube. It changes how their pages work, which their terms may not allow, so use it at your own risk.

Works in Chrome, Brave and other Chromium browsers. No API key or account needed.

## Install

1. Download this repo (**Code > Download ZIP**) and unzip it, or clone it, somewhere it can stay.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the folder containing `manifest.json`.
5. Reload any open Twitch tabs.

Open the settings from the extension's icon in Twitch's top bar or the browser toolbar.

## Features

- **YouTube live streams on Twitch:** watch them with chat in a Twitch-style view, from the sidebar or the Following page. Add channels with the **+** button in the sidebar. Your subscriptions appear on their own if you're signed in to YouTube in the same browser, and you can hide the ones you don't want.
- **Kick live streams on Twitch:** the channels you follow on Kick get their own Kick Live section, with the same view as YouTube streams, if you're signed in to Kick in the same browser. Add other channels and hide the ones you don't want, the same way.
- **Floating chat (Alt+C):** watch Twitch, YouTube or Kick fullscreen with chat in a window you can move, resize and make see-through.
- **Stacked mode (Alt+S):** Twitch, YouTube or Kick full width with chat under it, for narrow windows.
- **Theatre mode (Alt+T)** on YouTube and Kick streams, like Twitch's own.
- **Stream quality:** choose what streams start at on Twitch, YouTube and Kick, up to 1440p.
- **Chat font size** for Twitch, YouTube and Kick chat.
- **Cleaner Twitch chat:** hide timestamps, the top strip, drops, pinned messages and the Hype Train.
- **Stream previews:** hover a live channel in the sidebar to see an image of the stream, on Twitch, YouTube and Kick. You can turn this off.
- **Cleaner sidebar:** hide Live Channels, Recommended Categories, Viewers Also Watch, and turn off YouTube Live and Kick Live.
- **Cleaner player:** hide what streamers' Twitch extensions show over the video.
- **Auto-claim channel points**, only in a tab where the stream is playing. Off by default.
- **Dark or light theme** for the settings window and the YouTube and Kick stream view. Kick's chat stays dark.

## Good to know

- **YouTube access:** the extension checks what's live every minute while a Twitch tab is open, using your YouTube sign-in. To play streams inside Twitch, it allows YouTube cookies on twitch.tv, which is why the browser warns about cookie settings, and removes YouTube's anti-framing and content security headers for `/watch` frames opened from twitch.tv.
- **Kick access:** the extension checks what's live every minute while a Twitch tab is open, using your Kick sign-in, which only goes to Kick. To let you chat inside Twitch, it allows Kick cookies on twitch.tv and keeps a copy of your Kick sign-in and your answer to its cookie prompt, which browsers only send to Kick under Twitch. Your real Kick cookies aren't changed. If a Kick stream keeps loading, open kick.com and answer its cookie prompt once.
- **What Twitch can see:** your live YouTube subscriptions and Kick follows are drawn into Twitch's page, so Twitch and scripts running on its page could read them.
- **Brave:** if chat says "Sign in to chat" while you're signed in to YouTube or Kick, open Brave Shields on twitch.tv and allow cross-site cookies.
- **Site updates:** this relies on how Twitch, YouTube and Kick build their pages, so their updates can break parts of it.
- **Updating:** replace the files in the same folder (or `git pull`), then use **Reload** on the extensions page. Removing the extension, or loading it from a different folder, loses your saved channels and settings.

## Feedback and contributing

Found a bug or have an idea? Open an issue, for both bug reports and feature requests, or use the **Feedback** links in the settings window. Before reporting a bug, please turn off your other Twitch extensions and check that it still happens, since they can change the same parts of the page. It also helps to say which browser you use and what you were watching: a Twitch stream, a Twitch video or a YouTube stream.

Pull requests are welcome too. For a bigger change, open an issue first so we can talk it through. [CONTRIBUTING.md](CONTRIBUTING.md) covers how the code is laid out and how to add a setting or a feature, and [TESTING.md](TESTING.md) lists what to check by hand.

## License

MIT, see [LICENSE](LICENSE). Inter, in `fonts/`, stays under the SIL Open Font License, see `fonts/Inter-LICENSE.txt`.
