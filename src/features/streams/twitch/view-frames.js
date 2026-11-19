// The stream view's two frames, a stream's player and its chat.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, theme, themeBase } = skek.helpers;
  const { state, siteOf } = shared;

  function frame(className, src, allow) {
    return el('iframe', {
      class: className,
      src,
      allow,
      allowFullscreen: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
  }

  // The sizes behind Twitch's own chat font size setting.
  const TWITCH_CHAT_FONT_SIZES = { small: 12, default: 14, bigger: 16, biggest: 18 };

  // The chat frame can't read Twitch's storage, so it gets this in its address.
  function twitchChatFontSize() {
    try {
      const preference = JSON.parse(localStorage.getItem('chatSettings'))?.fontSizePreference;
      return TWITCH_CHAT_FONT_SIZES[preference] ?? TWITCH_CHAT_FONT_SIZES.default;
    } catch {
      return TWITCH_CHAT_FONT_SIZES.default;
    }
  }

  // What a chat frame gets in its address.
  function chatSettings() {
    return `#skek-theme=${theme()}&skek-theme-base=${themeBase()}&skek-twitch-font=${twitchChatFontSize()}`;
  }

  function loadStream(channel, stream) {
    const { view } = state;
    const { refs } = view;
    const key = stream ? `${channel?.id}/${stream.videoId}` : null;
    if (view.streamKey === key) return;
    view.streamKey = key;

    if (!stream) {
      refs.player.replaceChildren(
        el('div', { class: 'skek-offline' }, el('p', {}, `${channel?.name ?? 'This channel'} is offline.`)),
      );
      refs.chat.replaceChildren(el('p', { class: 'skek-chat__empty' }, 'Chat is available while the channel is live.'));
      return;
    }

    const urls = siteOf(channel).frameUrls(channel, stream, chatSettings());
    refs.player.replaceChildren(
      frame('skek-player__frame', urls.player, 'autoplay; encrypted-media; picture-in-picture; fullscreen'),
    );
    const chatFrame = frame('skek-chat__frame', urls.chat, 'clipboard-write');
    chatFrame.addEventListener('load', syncChatFrame);
    refs.chat.replaceChildren(chatFrame);
  }

  // In floating chat the window draws the background, so the frame has to stop drawing its own.
  function syncChatFrame() {
    const { view } = state;
    const chatFrame = view?.refs.chat.querySelector('iframe');
    chatFrame?.contentWindow.postMessage({ skekChatTransparent: view.layout === 'floating' }, new URL(chatFrame.src).origin);
  }

  Object.assign(shared, { frame, chatSettings, loadStream, syncChatFrame });
})();
