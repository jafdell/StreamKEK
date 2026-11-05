# Testing

`node --test` only covers a few small functions, so try your change in the browser too.

1. Reload the extension and your Twitch tabs, as described under [Development setup](CONTRIBUTING.md#development-setup).
2. Check the extensions page for service worker errors.
3. Try what you changed, using the table below.
4. Check the basics still work: a YouTube stream opens from the sidebar, plays, its chat loads, and Back returns to Twitch.

In a pull request, say what you tried and what you couldn't.

| If you changed | Try |
| --- | --- |
| YouTube Live | The sidebar section, a channel with several streams, an offline channel, and reloading on `/yt/<channel>` |
| Channel manager | Adding and removing a channel in the **+** frame and in the settings window's YouTube and Kick tabs, which should each show only their own channels, and the subscriptions and follows switches |
| Hiding subscriptions | Hiding a live subscription from its sidebar card, that it stays hidden after a reload, and **Show** in the **+** frame and the settings window. The card you're watching, a channel you added and the collapsed sidebar shouldn't offer hiding. Hiding a stream that's open in another tab closes it there |
| Kick Live | The sidebar section under YouTube Live, its previews and hiding, a stream with its player filling the frame, its quality menu, chat being signed in and **Watch on Kick**, reloading on `/kick/<channel>`, adding a Kick link with **+**, being signed out of Kick, and that kick.com in a normal tab is unchanged |
| Following page | The **YouTube** and **Kick** tabs and the **YouTube live** and **Kick live** sections |
| Theatre, stacked or floating chat | The button, Alt key and Esc, on a YouTube stream, a Kick stream, a Twitch stream and a Twitch video. The video shouldn't restart |
| Floating chat | Also dragging, resizing, the slider, typing a message, and double-clicking the video to leave fullscreen |
| Stream quality | Each choice on a Twitch, a YouTube and a Kick stream, and a size the stream doesn't offer |
| Chat settings | Twitch chat, chat on a Twitch video and YouTube chat, with and without [7TV](https://7tv.app) |
| Sidebar previews | Hovering a live and an offline channel, near the top and bottom of the window, in the expanded and collapsed sidebar, on Twitch and YouTube channels, and each stream of a YouTube channel with several |
| Hide settings | Turning each on and off in the expanded and collapsed sidebar, in chat, or on a channel with extensions over the video, hovering the player |
| Feedback links | Each link in the settings window and the toolbar popup opens the right GitHub page in a new tab, and the bug form has the version filled in |
| Theme | Both themes, in the settings window, the stream view and its chat |
| Auto-claim | A channel with channel points, with the stream playing and paused |
| Storage or the service worker | Your channels and settings are still there after a reload |

Busy channels from [twitch.tv/directory/all](https://www.twitch.tv/directory/all) are the easiest place to test. You can't trigger drops, pinned messages, sub notices, clips or Hype Trains yourself, so check those when one appears.
