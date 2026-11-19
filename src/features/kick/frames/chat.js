// Runs in Kick's chat frame in the stream view, where chat.css makes it look like Twitch's.
// streams/frames/chat-settings.js does the rest, the theme included. Normal Kick tabs are untouched.
(() => {
  'use strict';

  if (!location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  // An attribute, because Kick's page could reset <html>'s classes when it starts up.
  document.documentElement.toggleAttribute('data-skek-kick-chat', true);
})();
