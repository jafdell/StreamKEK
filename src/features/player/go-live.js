// The Start the stream when a channel goes live setting. An offline channel's page doesn't start by
// itself when the channel goes live: its Home tab has no player to start, and with chat open Twitch
// tries once and leaves the player as it is if the stream isn't there yet. So while you wait on such
// a page, this asks Twitch every few seconds whether the channel is live, and once it is, reloads the
// page, which is what starts the stream when you do it by hand.
// Only on the channel's own page, /name, on Home or with chat open, not on About, Videos, Clips or
// Schedule. Not while there's text in the chat box, which a reload would lose. A reload that came
// too early, with the page still offline after it, is followed by two more, and then the page is
// left alone.
// Sometimes Twitch notices by itself on Home, and plays the stream in the picture at the top of the
// page instead of in its normal view. So a page that showed the channel as offline and now shows
// that picture gets its "Watch now" link clicked, which opens the normal view with no reload.
// Twitch can also show the channel as live, with its viewers and LIVE badge, while the player still
// has nothing in it: after that link, or after a reload that came just before the stream was there.
// Nothing on Twitch's page starts the player then, so that gets a reload as well.
// If Twitch's markup changes, nothing happens.
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
  // WATCH is on the page while it shows a stream in its normal view, with chat beside it. On Home a
  // live stream plays in the picture at the top instead, over which WATCH_NOW opens the normal view.
  const WATCH = '.channel-root--watch';
  const WATCH_NOW = "a[data-a-target='home-live-overlay-button']";
  const CHAT_BOX = "[data-a-target='chat-input']";
  // Twitch's player. With nothing loaded its video has readyState 0, where a paused stream has 1,
  // and it may show OFFLINE_SCREEN, the channel's latest video. GATE is the player saying something
  // of its own, like an error, which a reload for going live isn't for.
  const VIDEO = '.video-ref video';
  const OFFLINE_SCREEN = '.video-player__overlay .offline-recommendations-video-card';
  const GATE = "[data-a-target='player-overlay-content-gate']";
  const QUERY = 'query($login:String!){user(login:$login){stream{id}}}';
  // In the tab's sessionStorage, so it's still there after the reload.
  const KEY = 'skek-go-live';
  const CHECK_MS = 15_000;
  const LOOK_MS = 2_000;
  const TIMEOUT_MS = 10_000;
  // How long the player has had nothing in it before that counts. When Twitch starts the stream by
  // itself, the player is empty for a moment first.
  const EMPTY_MS = 6_000;

  // The channel Twitch has said is offline since this page opened, or since it last showed a stream.
  let offlineSeen = null;
  // The channel whose page has shown it as offline, and hasn't shown its stream in the normal view
  // since. A stream at the top of its Home is then one that just started, not one you went to Home
  // from.
  let offlineShown = null;
  // The channel whose page doesn't show it as offline while its player has nothing in it, and since
  // when: { login, since }.
  let empty = null;
  let checking = false;

  const channelHere = () => channelPage(location.pathname, skek.chatEmotes.channelFromPath);
  const showsOffline = () => !!document.querySelector(OFFLINE);

  function playerEmpty() {
    if (document.querySelector(GATE)) return false;
    return !!document.querySelector(OFFLINE_SCREEN) || document.querySelector(VIDEO)?.readyState === 0;
  }

  // Whether the page is waiting for the stream: it shows the channel as offline, or its player has
  // stayed empty.
  const waits = (login) => showsOffline() || (empty?.login === login && Date.now() - empty.since >= EMPTY_MS);

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
    if (!waits(login)) {
      // The stream is showing, so there's nothing left to try again, and a stream that drops out
      // later isn't one that just started.
      if (document.querySelector(LIVE) && !playerEmpty()) {
        offlineSeen = null;
        sessionStorage.removeItem(KEY);
      }
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
      if (channelHere() !== login || !waits(login)) return;
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

  // Opens the normal view when Twitch started the stream at the top of Home by itself, and notes
  // for check() how long the player has been empty.
  function look() {
    if (!document.documentElement.matches(ON) || document.getElementById('skek-view')) {
      empty = null;
      return;
    }
    const login = channelHere();
    if (offlineShown !== login) offlineShown = null;
    if (!login || showsOffline() || !playerEmpty()) empty = null;
    else if (empty?.login !== login) empty = { login, since: Date.now() };
    if (!login) return;
    if (showsOffline()) {
      offlineShown = login;
      return;
    }
    if (!offlineShown || !document.querySelector(LIVE)) return;
    if (document.querySelector(WATCH)) {
      offlineShown = null;
      return;
    }
    const link = document.querySelector(WATCH_NOW);
    if (!link) return;
    offlineShown = null;
    link.click();
  }

  setInterval(check, CHECK_MS);
  setInterval(look, LOOK_MS);
})();
