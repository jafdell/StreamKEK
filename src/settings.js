// The settings shown in the settings window. Add a setting here and its searchable
// row, its category and its storage default exist automatically; see CONTRIBUTING.md.
// `key` is also the chrome.storage.local key, so never rename one after release.
// Also loaded in YouTube's and Kick's frames and Twitch's embedded player, for the defaults.
// It only adds `skek` to the extension's own world there, which the page can't see.
// `resolveTheme` is here too, because every place that shows a theme loads this file.
// `category` is where it's listed. Categories, and the items in each, show in alphabetical order.
// `message` is optional: the window sends { type: message, enabled } to the background instead
// of writing storage itself, for a setting that has background work to do when it changes.
// `choices` is optional: buttons to pick one value from, instead of an on/off switch. Add
// `dropdown: true` when there are too many for buttons to fit, or `swatches: true` to show each as
// a picture of a theme, under its `group`.
(() => {
  'use strict';

  const SETTINGS = [
    {
      key: 'hideForYou',
      category: 'Sidebar',
      label: 'Hide For You',
      hint: "Removes the For You heading at the top of Twitch's sidebar, and the stories and watch streak under it.",
      default: false,
    },
    {
      key: 'hideLiveChannels',
      category: 'Sidebar',
      label: 'Hide Live Channels',
      hint: "Removes Twitch's Live Channels list from the sidebar.",
      default: false,
    },
    {
      key: 'hideRecommendedCategories',
      category: 'Sidebar',
      label: 'Hide Recommended Categories',
      hint: "Removes Twitch's Recommended Categories list from the sidebar.",
      default: false,
    },
    {
      key: 'hideViewersAlsoWatch',
      category: 'Sidebar',
      label: 'Hide Viewers Also Watch',
      hint: 'Removes the Viewers Also Watch list that Twitch adds to the sidebar on channel pages.',
      default: false,
    },
    {
      key: 'showYouTubeLive',
      category: 'Sidebar',
      label: 'Show YouTube Live',
      hint: 'Shows the YouTube Live section in the sidebar. The Following page shows your streams either way.',
      default: true,
    },
    {
      key: 'showKickLive',
      category: 'Sidebar',
      label: 'Show Kick Live',
      hint: 'Shows the Kick Live section in the sidebar. The Following page shows your streams either way.',
      default: true,
    },
    {
      key: 'sidebarPreviews',
      category: 'Sidebar',
      label: 'Show stream previews',
      hint: 'Shows an image of the stream when you hover a live channel in the sidebar, on Twitch, YouTube and Kick.',
      default: true,
    },
    {
      key: 'chatFontSize',
      category: 'Chat',
      label: 'Chat font size',
      hint: "Text size in Twitch, YouTube and Kick chat. Twitch's setting uses the size from Twitch's own chat settings.",
      default: 'twitch',
      dropdown: true,
      choices: [
        { value: 'twitch', label: "Twitch's setting" },
        ...[10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30].map((px) => ({ value: String(px), label: `${px} px` })),
      ],
    },
    {
      key: 'hideChatTimestamps',
      category: 'Chat',
      label: 'Hide timestamps',
      hint: 'Removes the time next to each message in Twitch chat, on streams and videos. On videos it also removes the button that jumps to that moment.',
      default: false,
    },
    {
      key: 'hideChatTopStrip',
      category: 'Chat',
      label: 'Hide top strip',
      hint: 'Removes the strip above Twitch chat with top gifters, top cheerers and sub goals.',
      default: false,
    },
    {
      key: 'hideChatDrops',
      category: 'Chat',
      label: 'Hide drops',
      hint: 'Removes the cards over Twitch chat that promote Drops, like sub badges.',
      default: false,
    },
    {
      key: 'hideChatPinned',
      category: 'Chat',
      label: 'Hide pinned messages',
      hint: 'Removes messages the streamer or mods pinned over Twitch chat.',
      default: false,
    },
    {
      key: 'hideChatHypeTrain',
      category: 'Chat',
      label: 'Hide Hype Train',
      hint: 'Removes the Hype Train banner over Twitch chat. Kappa Trains still show.',
      default: false,
    },
    {
      key: 'showDeletedMessages',
      category: 'Chat',
      label: 'See deleted messages',
      hint: 'Keeps a message readable in Twitch chat after a moderator deletes it, or times out or bans whoever wrote it. It shows faded and crossed out, and its links no longer open. Only on live streams, and only for messages that were in chat before they were deleted.',
      default: false,
    },
    {
      key: 'autoClaimPoints',
      category: 'Chat',
      label: 'Auto-claim channel points',
      hint: 'Presses the claim button for you when a bonus appears, only in a tab where the stream is playing.',
      default: false,
    },
    {
      key: 'chatEmotes',
      category: 'Chat',
      label: '7TV, BTTV and FFZ emotes',
      hint: 'Shows these emotes in Twitch chat, including animated ones, with a button in the chat box to search and pick them. Your recently used emotes are listed at the top there, Twitch emotes too. Does nothing if you have one of their extensions, which shows them itself.',
      default: true,
    },
    {
      key: 'chatEmoteAutocomplete',
      category: 'Chat',
      label: 'Autocomplete emotes with Tab',
      hint: "In Twitch's chat box, type the start of an emote's name and press Tab to see it, then Tab again for the next match, or Shift+Tab to go back. Includes the Twitch emotes you can use there. Needs the 7TV, BTTV and FFZ emotes setting on. Names starting with @ still complete as usual.",
      default: false,
    },
    {
      key: 'chatLatestEmote',
      category: 'Chat',
      label: 'Show the latest emote in the chat box',
      hint: "While Twitch's chat box is empty, shows the name of the emote chat used last where it says Send a message. Press Tab to put it in your message. Twitch's own emotes, and 7TV, BTTV and FFZ ones with that setting on. Typing takes it away.",
      default: true,
    },
    {
      key: 'chatFollowedDate',
      category: 'Chat',
      label: 'Show when you followed a channel',
      hint: "Type /followed in Twitch's chat box to see the date you followed that channel. Only you see the answer, and nothing is sent to chat. Your own card, which opens when you click your name in chat, shows the date too. Twitch only tells it to you, so this asks Twitch with your Twitch sign-in.",
      default: true,
    },
    {
      key: 'hidePlayerExtensions',
      category: 'Player',
      label: 'Hide extensions over the video',
      hint: "Removes what streamers' Twitch extensions show over the video, like Prime Benefits and the icons on its right edge. Twitch's own player controls stay.",
      default: false,
    },
    {
      key: 'autoReloadPlayer',
      category: 'Player',
      label: 'Reload player on errors',
      hint: "Reloads Twitch's player when a stream or video stops with an error like #2000, so you don't have to. Gives up after a few tries if the error keeps coming back.",
      default: true,
    },
    {
      key: 'autoStartLive',
      category: 'Player',
      label: 'Start the stream when a channel goes live',
      hint: "While you wait on an offline Twitch channel, on its Home tab or with its chat open, checks every 15 seconds whether it went live, then reloads the page so the stream starts. Waits while there's text in the chat box. Not on a channel's About, Videos, Clips or Schedule.",
      default: false,
    },
    {
      key: 'keepBackgroundQuality',
      category: 'Player',
      label: 'Keep quality in background tabs',
      hint: "Stops Twitch lowering a live stream to 360p about a minute after you switch to another tab or minimize the window. A stream in the background then uses as much data as one you're watching.",
      default: false,
    },
    {
      key: 'streamQuality',
      category: 'Player',
      label: 'Stream quality',
      hint: "What streams start at on Twitch, YouTube and Kick. If a stream doesn't offer it, the next size down plays. The player's own quality menu still works.",
      default: '1440',
      dropdown: true,
      // A new choice also needs an entry in HIGHEST_FOR_SETTING in youtube/frames/watch-start.js.
      choices: [
        ...[1440, 1080, 720, 480, 360].map((height) => ({ value: String(height), label: `${height}p` })),
        { value: 'auto', label: 'Automatic' },
      ],
    },
    {
      key: 'liveNotifications',
      category: 'Notifications',
      label: 'Notify me when a favorite goes live',
      hint: "Shows a notification when a channel in your Favorites starts a stream on Twitch, YouTube or Kick. Works while the browser is open, also with no Twitch tab, and checks every minute. Clicking it opens the stream. Your computer's Do Not Disturb or Focus can hold them back.",
      default: false,
    },
    {
      key: 'showSubscriptions',
      category: 'YouTube',
      label: 'Show my live YouTube subscriptions',
      hint: "Lists your subscriptions while they're live. Needs you signed in to YouTube in this browser.",
      default: true,
      message: 'youtube-live:showSubscriptions',
    },
    {
      key: 'showKickFollows',
      category: 'Kick',
      label: 'Show my live Kick follows',
      hint: "Lists the channels you follow on Kick while they're live. Needs you signed in to Kick in this browser.",
      default: true,
      message: 'kick-live:showFollows',
    },
    {
      key: 'theme',
      category: 'Appearance',
      label: 'Theme',
      hint: "Colors Twitch, this window, popups, the stream view and YouTube's chat. Dark and Light are Twitch's own two themes, and this setting takes over from Twitch's Dark Theme switch. Kick's chat stays dark in a light theme.",
      default: 'dark',
      swatches: true,
      // `base` is which of Twitch's own two themes a theme is built on, and `group` its heading in
      // the picker. A new theme also needs its colors in features/themes/palettes.css.
      choices: [
        { value: 'dark', label: 'Dark', group: 'Twitch', base: 'dark' },
        { value: 'light', label: 'Light', group: 'Twitch', base: 'light' },
        { value: 'midnight', label: 'Midnight', group: 'Themes', base: 'dark' },
        { value: 'slate', label: 'Slate', group: 'Themes', base: 'dark' },
        { value: 'dusk', label: 'Dusk', group: 'Themes', base: 'dark' },
        { value: 'forest', label: 'Forest', group: 'Themes', base: 'dark' },
        { value: 'ember', label: 'Ember', group: 'Themes', base: 'dark' },
        { value: 'aurora', label: 'Aurora', group: 'Themes', base: 'dark' },
        { value: 'synthwave', label: 'Synthwave', group: 'Themes', base: 'dark' },
        { value: 'terminal', label: 'Terminal', group: 'Themes', base: 'dark' },
        { value: 'paper', label: 'Paper', group: 'Themes', base: 'light' },
        { value: 'cotton-candy', label: 'Cotton Candy', group: 'Themes', base: 'light' },
        { value: 'winter', label: 'Winter', group: 'Seasons', base: 'dark' },
        { value: 'spring', label: 'Spring', group: 'Seasons', base: 'light' },
        { value: 'summer', label: 'Summer', group: 'Seasons', base: 'light' },
        { value: 'autumn', label: 'Autumn', group: 'Seasons', base: 'dark' },
        { value: 'christmas', label: 'Christmas', group: 'Specials', base: 'dark' },
        { value: 'halloween', label: 'Halloween', group: 'Specials', base: 'dark' },
      ],
    },
  ];

  const THEME = SETTINGS.find((s) => s.key === 'theme');
  const THEMES = THEME.choices;

  // Which theme to show for the Theme setting: its name, and `base`, the one of Twitch's own two
  // themes it's built on. A theme that no longer exists shows as the default one.
  function resolveTheme(setting) {
    const theme = THEMES.find((each) => each.value === setting) ?? THEMES.find((each) => each.value === THEME.default);
    return { name: theme.value, base: theme.base };
  }

  globalThis.skek = {
    SETTINGS,
    settingDefaults: Object.fromEntries(SETTINGS.map((s) => [s.key, s.default])),
    resolveTheme,
  };
})();
