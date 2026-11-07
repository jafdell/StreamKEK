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
- **Kick live streams on Twitch:** the channels you follow on Kick get their own Kick Live section, with the same view as YouTube streams, if you're signed in to Kick in the same browser. Add other channels and hide the ones you don't want, the same way. Streams start at the volume you last chose.
- **Favorites:** drag a Twitch, YouTube or Kick channel to the top of the sidebar, or press its star, to keep them together in your own order while they're live, each marked with its site.
- **Multi-stream:** drag a channel from the sidebar onto the page to watch two to four streams at once, from any site. Two streams each keep their chat under them, and more share one chat you pick. Only one has sound at a time, and you can drag a stream's name onto another to swap them.
- **Floating chat (Alt+C):** watch Twitch, YouTube or Kick fullscreen with chat in a window you can move, resize and make see-through.
- **Stacked mode (Alt+S):** Twitch, YouTube or Kick full width with chat under it, for narrow windows.
- **Theatre mode (Alt+T)** on YouTube and Kick streams, like Twitch's own.
- **Stream quality:** choose what streams start at on Twitch, YouTube and Kick, up to 1440p.
- **Chat font size** for Twitch, YouTube and Kick chat.
- **Blocked and highlighted words** in Twitch, YouTube and Kick chat: remove messages containing the words you choose, or make them stand out.
- **7TV, BTTV and FFZ emotes** in Twitch chat, including animated ones, with no other extension needed. Click one to add it to your message, pick one from the button in the chat box, or type its name to see it there. You can turn this off.
- **Autocomplete emotes with Tab** in Twitch chat, including the Twitch emotes you can use there. It's off by default.
- **Backup and restore:** save your settings, channels, favorites and chat words to a file, and put them back after a reinstall.
- **Cleaner Twitch chat:** hide timestamps, the top strip, drops, pinned messages and the Hype Train.
- **Stream previews:** hover a live channel in the sidebar to see an image of the stream, on Twitch, YouTube and Kick. You can turn this off.
- **Cleaner sidebar:** hide For You, Live Channels, Recommended Categories, Viewers Also Watch, and turn off YouTube Live and Kick Live.
- **Cleaner player:** hide what streamers' Twitch extensions show over the video.
- **Auto-claim channel points**, only in a tab where the stream is playing. Off by default.
- **Dark or light theme** for the settings window and the YouTube and Kick stream view. Kick's chat stays dark.

## Good to know

- **YouTube access:** the extension checks what's live every minute while a Twitch tab is open, using your YouTube sign-in. To play streams inside Twitch, it allows YouTube cookies on twitch.tv, which is why the browser warns about cookie settings, and removes YouTube's anti-framing and content security headers for `/watch` frames opened from twitch.tv.
- **Kick access:** the extension checks what's live every minute while a Twitch tab is open, using your Kick sign-in, which only goes to Kick. To let you chat inside Twitch, it allows Kick cookies on twitch.tv and keeps a copy of your Kick sign-in and your answer to its cookie prompt, which browsers only send to Kick under Twitch. Your real Kick cookies aren't changed, and the copy lasts a day at most once the extension is removed or turned off. If a Kick stream keeps loading, open kick.com and answer its cookie prompt once.
- **What Twitch can see:** your live YouTube subscriptions and Kick follows, the channels you added, your favorites, the stream you're watching and your StreamKEK settings are all in Twitch's page, so Twitch and scripts running on its page could read them. The stream you're watching is also in the address, which reaches Twitch's servers if you reload. Your sign-ins can't be read this way.
- **Brave:** if chat says "Sign in to chat" while you're signed in to YouTube or Kick, open Brave Shields on twitch.tv and allow cross-site cookies.
- **Streams lag on a second screen:** if your screens have different refresh rates, like 170 Hz and 60 Hz, streams can lag on the slower one while the browser is the selected window, especially with several open. Chrome and Brave both do this. The easiest fix is to move the browser to your fastest screen. To keep it where it is, open `chrome://flags/#use-angle` (`brave://flags/#use-angle` in Brave), choose **D3D11 WARP** and relaunch. This uses much more CPU across the whole browser, so it suits faster PCs. Set it back to **Default** if your PC struggles.
- **Site updates:** this relies on how Twitch, YouTube and Kick build their pages, so their updates can break parts of it.
- **Updating:** replace the files in the same folder (or `git pull`), then use **Reload** on the extensions page. Removing the extension, or loading it from a different folder, loses your saved channels and settings.

## Feedback and contributing

Found a bug or have an idea? Open an issue, for both bug reports and feature requests, or use the **Feedback** links in the settings window. Before reporting a bug, please turn off your other Twitch extensions and check that it still happens, since they can change the same parts of the page. It also helps to say which browser you use and what you were watching: a Twitch stream, a Twitch video or a YouTube stream.

Pull requests are welcome too. For a bigger change, open an issue first so we can talk it through. [CONTRIBUTING.md](CONTRIBUTING.md) covers how the code is laid out and how to add a setting or a feature, and [TESTING.md](TESTING.md) lists what to check by hand.

## License

MIT, see [LICENSE](LICENSE). Inter, in `fonts/`, stays under the SIL Open Font License, see `fonts/Inter-LICENSE.txt`.
