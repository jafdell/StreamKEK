// The Start the stream when a channel goes live setting. An offline channel's page doesn't start by
// itself when the channel goes live: its Home tab has no player to start, and with chat open Twitch
// tries once and leaves the player as it is if the stream isn't there yet. So while you wait on such
// a page, this asks Twitch every few seconds whether the channel is live, and once it is, reloads the
// page, which is what starts the stream when you do it by hand.
// Only on the channel's own page, /name, on Home or with chat open, not on About, Videos, Clips or
// Schedule. Not while there's text in the chat box, which a reload would lose. A reload that came
// too early, with the page still offline after it, is followed by two more, and then the page is
// left alone. If Twitch's markup changes, nothing happens.
// This loads after emotes.js, for the channel in the address.
(() => {
  'use strict';

  // How long after each reload the next may follow, while Twitch says live and the page doesn't.
  const RETRY_WAITS_MS = [20_000, 60_000];
  // A reload longer ago than this was for another stream.
  const RETRY_FOR_MS = 5 * 60_000;

  // The channel whose own page this is: /name with nothing after it.
  function channelPage(pathname, channelFromPath) {
    return pathname.split('/').filter(Boolean).length === 1 ? channelFromPath(pathname) : null;
  }

  // Whether to reload now, for a channel Twitch says is live while its page shows it offline.
  // `sawOffline` is whether Twitch has said offline since this page opened, which makes this the
  // moment it went live. Otherwise the page may have just been reloaded for that, and `reloaded` is
  // what that left in the tab: { login, at, tries }.
  function reloadNow(login, sawOffline, reloaded, now) {
    if (sawOffline) return true;
    if (reloaded?.login !== login || now - reloaded.at > RETRY_FOR_MS) return false;
    const wait = RETRY_WAITS_MS[reloaded.tries - 1];
    return wait !== undefined && now - reloaded.at >= wait;
  }

  skek.goLive = { channelPage, reloadNow };

  // The tests have no page, and only need the functions above.
  if (typeof document === 'undefined') return;

  const ON = "[data-skek-on~='autoStartLive']";
  // On the player's place in a channel's page while Twitch shows the channel as offline, on Home and
  // with chat open. LIVE is on the page while it shows a stream.
  const OFFLINE = '.channel-root__player--offline';
  const LIVE = '.channel-root--live';
  const CHAT_BOX = "[data-a-target='chat-input']";
  const QUERY = 'query($login:String!){user(login:$login){stream{id}}}';
  // In the tab's sessionStorage, so it's still there after the reload.
  const KEY = 'skek-go-live';
  const CHECK_MS = 15_000;
  const TIMEOUT_MS = 10_000;

  // The channel Twitch has said is offline since this page opened.
  let offlineSeen = null;
  let checking = false;

  const channelHere = () => channelPage(location.pathname, skek.chatEmotes.channelFromPath);
  const showsOffline = () => !!document.querySelector(OFFLINE);

  function lastReload() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY));
    } catch {
      return null;
    }
  }

  async function check() {
    // Behind the stream view, Twitch's page isn't what's being watched.
    if (checking || !document.documentElement.matches(ON) || !navigator.onLine || document.getElementById('skek-view')) return;
    const login = channelHere();
    if (!login) return;
    if (offlineSeen !== login) offlineSeen = null;
    if (!showsOffline()) {
      // The stream is showing, so there's nothing left to try again.
      if (document.querySelector(LIVE)) sessionStorage.removeItem(KEY);
      return;
    }
    checking = true;
    try {
      const data = await skek.twitchGql(QUERY, { login }, AbortSignal.timeout(TIMEOUT_MS));
      if (!data?.user) return;
      if (!data.user.stream?.id) {
        offlineSeen = login;
        sessionStorage.removeItem(KEY);
        return;
      }
      // The page can have changed while Twitch answered.
      if (channelHere() !== login || !showsOffline()) return;
      if (document.querySelector(CHAT_BOX)?.textContent.replace(/﻿/g, '').trim()) return;
      const sawOffline = offlineSeen === login;
      const reloaded = lastReload();
      const now = Date.now();
      if (!reloadNow(login, sawOffline, reloaded, now)) return;
      sessionStorage.setItem(KEY, JSON.stringify({ login, at: now, tries: sawOffline ? 1 : reloaded.tries + 1 }));
      location.reload();
    } catch {
      // Twitch didn't answer. The next check asks again.
    } finally {
      checking = false;
    }
  }

  setInterval(check, CHECK_MS);
})();
