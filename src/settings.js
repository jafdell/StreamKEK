// The settings shown in the settings window. Add a setting here and its searchable
// row, its category and its storage default exist automatically; see CONTRIBUTING.md.
// `key` is also the chrome.storage.local key, so never rename one after release.
// Also loaded in YouTube's frames, for the defaults. It only adds `skek` to the extension's own
// world there, which the page can't see.
// `category` is where it's listed. Categories, and the items in each, show in alphabetical order.
// `message` is optional: the window sends { type: message, enabled } to the background instead
// of writing storage itself, for a setting that has background work to do when it changes.
// `choices` is optional: buttons to pick one value from, instead of an on/off switch. Add
// `dropdown: true` when there are too many for buttons to fit.
(() => {
  'use strict';

  const SETTINGS = [
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
      key: 'hideYouTubeLive',
      category: 'Sidebar',
      label: 'Hide YouTube Live',
      hint: 'Removes the YouTube Live section from the sidebar. The Following page still shows your streams.',
      default: false,
    },
    {
      key: 'chatFontSize',
      category: 'Chat',
      label: 'Chat font size',
      hint: "Text size in both Twitch and YouTube chat. Twitch's setting uses the size from Twitch's own chat settings.",
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
      key: 'autoClaimPoints',
      category: 'Chat',
      label: 'Auto-claim channel points',
      hint: 'Presses the claim button for you when a bonus appears, only in a tab where the stream is playing.',
      default: false,
    },
    {
      key: 'streamQuality',
      category: 'Player',
      label: 'Stream quality',
      hint: "What streams start at on both Twitch and YouTube. If a stream doesn't offer it, the next size down plays. The player's own quality menu still works.",
      default: '1440',
      dropdown: true,
      // A new choice also needs an entry in HIGHEST_FOR_SETTING in youtube-live/frames/watch-start.js.
      choices: [
        ...[1440, 1080, 720, 480, 360].map((height) => ({ value: String(height), label: `${height}p` })),
        { value: 'auto', label: 'Automatic' },
      ],
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
      key: 'theme',
      category: 'Appearance',
      label: 'Theme',
      hint: 'Used by this window, popups, the stream view and its chat. The rest of Twitch keeps its own theme.',
      default: 'dark',
      choices: [
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ],
    },
  ];

  globalThis.skek = {
    SETTINGS,
    settingDefaults: Object.fromEntries(SETTINGS.map((s) => [s.key, s.default])),
  };
})();
