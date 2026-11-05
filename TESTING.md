# Testing

`node --test` covers a few small functions and how the project's files connect, not how anything behaves on a site, so try your change in the browser too.

1. Reload the extension and your Twitch tabs, as described under [Development setup](CONTRIBUTING.md#development-setup).
2. Check the extensions page for service worker errors.
3. Try what you changed, using the table below.
4. Check the basics still work: a YouTube stream and a Kick stream each open from the sidebar and play, their chat loads, and Back returns to Twitch.

In a pull request, say what you tried and what you couldn't.

| If you changed | Try |
| --- | --- |
| `streams/` or `sites.js` | Everything below that uses them, on both a YouTube and a Kick stream |
| YouTube Live | The sidebar section, a channel with several streams, an offline channel, and reloading on `/yt/<channel>` |
| Channel manager | A link to anything but a channel or video is refused. Adding and removing a channel in the **+** frame and in the settings window's YouTube and Kick tabs, which should each show only their own channels, and the subscriptions and follows switches |
| Hiding channels | Pressing the icon on a live subscription or Kick follow's sidebar card turns it into a confirmation. Cancel, moving the mouse away and double-clicking the icon all leave it unhidden. Hiding it with **Hide**, that it stays hidden after a reload, and **Show** in the **+** frame and the settings window. The card you're watching, a channel you added and the collapsed sidebar shouldn't offer hiding. Hiding a stream that's open in another tab closes it there. A script's `.click()` on **Hide** does nothing, because it needs a real click |
| Kick Live | The sidebar section under YouTube Live, its previews and hiding, a stream with its player filling the frame, in both Chrome and Brave, which behave differently on Kick's page, its quality menu, its volume starting at 100% and staying where you set it, chat being signed in, signing out of Kick signing chat out too, and **Watch on Kick**, reloading on `/kick/<channel>`, adding a Kick link with **+** and a name in the settings window's Kick tab, being signed out of Kick, and that kick.com in a normal tab is unchanged |
| A site's `watch.js` | Its stream still plays, filling the frame. A `/watch` or Kick channel page in a frame nested inside another frame on Twitch still shows only the player |
| Following page | The **YouTube** and **Kick** tabs and the **YouTube live** and **Kick live** sections |
| Theatre, stacked or floating chat | The button, Alt key and Esc, on a YouTube stream, a Kick stream, a Twitch stream and a Twitch video. The video shouldn't restart |
| Floating chat | Also dragging, resizing, the slider, typing a message, and double-clicking the video to leave fullscreen |
| Stream quality | Each choice on a Twitch, a YouTube and a Kick stream, and a size the stream doesn't offer |
| Chat settings | Twitch chat, chat on a Twitch video, YouTube chat and Kick chat, with and without [7TV](https://7tv.app) |
| Show YouTube Live and Show Kick Live | Each section goes away when switched off, in the expanded and collapsed sidebar. Hide YouTube Live, if you had it on, carries over as Show YouTube Live off |
| Sidebar previews | Hovering a live and an offline channel, near the top and bottom of the window, in the expanded and collapsed sidebar, on Twitch, YouTube and Kick channels, and each stream of a YouTube channel with several. With the setting off, no images show, and the titles and stream list still do |
| Sidebar highlight | Hovering a Twitch channel's card looks like hovering a YouTube or Kick one, and the channel you're watching is highlighted in the expanded and collapsed sidebar, and it moves when you change channel. Nothing extra is highlighted on a YouTube or Kick stream, the Following page or a category page |
| Hide settings | Turning each on and off in the expanded and collapsed sidebar, in chat, or on a channel with extensions over the video, hovering the player |
| Feedback links | Each link in the settings window and the toolbar popup opens the right GitHub page in a new tab, and the bug form has the version filled in |
| Theme | Both themes, in the settings window, the stream view and YouTube's chat. Kick's chat stays dark |
| Auto-claim | A channel with channel points, with the stream playing and paused |
| Storage or the service worker | Your channels and settings are still there after a reload |

Busy channels from [twitch.tv/directory/all](https://www.twitch.tv/directory/all) are the easiest place to test. You can't trigger drops, pinned messages, sub notices, clips or Hype Trains yourself, so check those when one appears.
