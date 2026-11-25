# StreamKEK

StreamKEK is a browser extension that makes Twitch the one place you watch live streams. It brings YouTube and Kick streams and their chat into Twitch, lets you watch several streams side by side, and gives you more control over Twitch's player, chat and sidebar.

It works in Chrome, Brave and other Chromium browsers, with no API key and no extra account. Get it from the [Chrome Web Store](https://chromewebstore.google.com/detail/streamkek/ndkccdbljjejloelgdcbikabojjaeomc), or visit [streamkek.com](https://streamkek.com) for more.

> Unofficial: StreamKEK is not affiliated with or endorsed by Twitch, YouTube or Kick.

## Features

### Watching

- **YouTube and Kick streams inside Twitch:** your live YouTube subscriptions and Kick follows show in Twitch's sidebar and on the Following page, and open with their chat in a Twitch-style view. Add other channels with the **+** button, and hide the ones you don't want.
- **About the stream and channel:** scroll down under a YouTube or Kick stream, like under a Twitch one, to see a YouTube stream's description, or a Kick channel's followers, description, links and panels.
- **Multi-stream:** drag a channel from the sidebar onto the page to watch two to four streams at once, with their chats, from any mix of Twitch, YouTube and Kick. Drag between streams to resize them, drag a stream's name onto another to swap them, and choose which one has the sound.
- **Favorites:** press a channel's star, or drag it to the top of the sidebar, to keep channels from all three sites together in your own order while they're live.
- **Go-live notifications:** get a notification when a favorite starts a stream, also with no Twitch tab open. Off by default.
- **Floating chat (Alt+C):** watch Twitch, YouTube or Kick fullscreen with chat in a window you can move, resize and make see-through.
- **Stacked mode (Alt+S):** the stream at full width with chat under it, for narrow windows.
- **Theatre mode (Alt+T):** on YouTube and Kick streams, like Twitch's own.
- **Picture-in-picture (Alt+P):** pop a Twitch, YouTube or Kick stream out into a small window that stays on top of your other apps, which you can move and resize.
- **Audio only (Alt+A):** listen to a Twitch stream or video without the picture, which saves data and battery.
- **Volume boost:** make a quiet Twitch stream or video up to four times louder with the button beside the volume, until you reload or change channel.
- **Keep quality in background tabs:** stop Twitch lowering a live stream to 360p when its tab is in the background. Off by default.
- **Reload player on errors:** Twitch's player reloads itself when a stream stops with an error, instead of you doing it by hand.
- **Start when a channel goes live:** wait on an offline Twitch channel and the stream starts by itself when it goes live, with no refresh. Off by default.
- **Stream quality:** choose what streams start at on Twitch, YouTube and Kick, up to 1440p.
- **Stream previews:** hover a live channel in the sidebar to see an image of its stream.

### Chat

- **7TV, BTTV and FFZ emotes:** see them in Twitch chat, animated ones included, with no other extension. Pick one from the button in the chat box, which lists your recently used emotes at the top, click one in chat to add it to your message, or type its name.
- **Autocomplete emotes with Tab:** type the start of an emote's name in Twitch chat and press Tab. Off by default.
- **Blocked and highlighted words:** remove messages containing the words you choose, or make them stand out, in Twitch, YouTube and Kick chat.
- **Chat font size:** one text size for Twitch, YouTube and Kick chat.
- **Latest emote in the chat box:** the empty Twitch chat box shows the name of the emote chat used last, and Tab puts it in your message.
- **When you followed a channel:** type `/followed` in Twitch chat to see the date, shown only to you. Your own card in chat shows it too.
- **See deleted messages:** keep reading a message in Twitch chat after a moderator deletes it. Off by default.
- **Cleaner chat:** hide Twitch chat's timestamps, top strip, drops, pinned messages and Hype Train.

### A tidier Twitch

- **Sort order that sticks:** the sort you pick on Browse, live channels and category pages stays in new tabs and after a restart, instead of going back to Recommended For You.
- **Cleaner sidebar:** hide For You, Live Channels, Recommended Categories and Viewers Also Watch, and turn off the YouTube Live and Kick Live sections.
- **Cleaner player:** hide what streamers' Twitch extensions show over the video.
- **Auto-claim channel points:** only in a tab where the stream is playing. Off by default.

### Settings

- **One searchable window:** open it from StreamKEK's icon in Twitch's top bar or the browser toolbar.
- **Backup and restore:** save your settings, channels, favorites and chat words to a file, and put them back after a reinstall.
- **Themes:** 16 themes that recolor Twitch, the settings window and the YouTube and Kick stream view, like Midnight, Synthwave and one for each season, besides Twitch's own dark and light. The seasons, Christmas and Halloween also move a little, like snow falling behind the sidebar, which a switch turns off. Kick's chat stays dark in a light theme.
- **What's new:** see what each version added, there or in the [changelog](CHANGELOG.md). After an update, a small **New** tag marks it until you open it.

## Install

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/streamkek/ndkccdbljjejloelgdcbikabojjaeomc), which also works in Brave, Edge and other Chromium browsers, and keeps it up to date.

To run the code from this repo instead:

1. Download this repo (**Code > Download ZIP**) and unzip it, or clone it, somewhere it can stay.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the folder containing `manifest.json`.
5. Reload any open Twitch tabs.

To update, replace the files in the same folder (or `git pull`), then press **Reload** on the extensions page. Don't remove the extension or load it from a different folder: that loses your saved channels and settings. Save a backup first if you have to.

## Good to know

### What it accesses

- **Who's live:** the extension asks YouTube and Kick every minute while a Twitch tab is open, using your sign-in on each, which only goes to that site. With go-live notifications on and a favorite on that site, it keeps asking with no Twitch tab.
- **Cookies on Twitch:** to play streams and let you chat inside Twitch, it allows YouTube's and Kick's cookies on twitch.tv, which is why the browser warns about cookie settings. For YouTube, it also removes the anti-framing and content security headers from `/watch` frames opened from twitch.tv. For Kick, it keeps a copy of your Kick sign-in and your answer to its cookie prompt, which browsers only send to Kick under Twitch. Your real Kick cookies aren't changed, and the copy lasts a day at most once the extension is removed or turned off.
- **Your Twitch sign-in:** Twitch only tells the date you followed a channel to you, so `/followed` and your own card ask Twitch with the sign-in its own page uses. It goes only to Twitch, only then, and isn't saved. Turn off **Show when you followed a channel** to stop it.
- **What Twitch can see:** your live YouTube subscriptions and Kick follows, the channels you added, your favorites, the stream you're watching and your StreamKEK settings are all in Twitch's page, so Twitch and scripts running on its page could read them. The stream you're watching is also in the address, which reaches Twitch's servers if you reload. Your sign-ins can't be read this way.

### If something's off

- **"Sign in to chat" in Brave:** if chat says this while you're signed in to YouTube or Kick, open Brave Shields on twitch.tv and allow cross-site cookies.
- **A Kick stream keeps loading:** open kick.com and answer its cookie prompt once.
- **No notifications:** check that your computer lets the browser show notifications, and that Do Not Disturb or a Focus isn't holding them back.
- **Streams lag on a second screen:** if your screens have different refresh rates, like 170 Hz and 60 Hz, streams can lag on the slower one while the browser is the selected window, especially with several open. Chrome and Brave both do this. The easiest fix is to move the browser to your fastest screen. To keep it where it is, open `chrome://flags/#use-angle` (`brave://flags/#use-angle` in Brave), choose **D3D11 WARP** and relaunch. This uses much more CPU across the whole browser, so it suits faster PCs. Set it back to **Default** if your PC struggles.
- **Something stopped working:** StreamKEK relies on how Twitch, YouTube and Kick build their pages, so their updates can break parts of it. Report it, as below.

## Feedback and contributing

Found a bug or have an idea? Open an issue, for both bug reports and feature requests, or use the **Feedback** links in the settings window. Before reporting a bug, please turn off your other Twitch extensions and check that it still happens, since they can change the same parts of the page. It also helps to say which browser you use and what you were watching: a Twitch stream, a Twitch video, a YouTube stream or a Kick stream.

Pull requests are welcome too. For a bigger change, open an issue first so we can talk it through. [CONTRIBUTING.md](CONTRIBUTING.md) covers how the code is laid out and how to add a setting or a feature, and [TESTING.md](TESTING.md) lists what to check by hand.

## License

MIT with the Commons Clause, see [LICENSE](LICENSE): free to use, change and share, but not to sell. Inter, in `fonts/`, stays under the SIL Open Font License, see `fonts/Inter-LICENSE.txt`.
