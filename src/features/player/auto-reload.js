// The Reload player on errors setting, for Twitch's player: when it stops with one of Twitch's
// numbered errors, like #2000, this reloads the player as the viewer would, so the stream comes
// back by itself, in a background tab too.
// Most errors show Twitch's own reload button, which this clicks. #5000, an address Twitch no
// longer accepts, shows none, so there this calls what that button calls: the part of Twitch's
// page that gives the player its stream, reached through React's internals as quality.js reaches
// the player. If they change, that error stays as it is.
// A reload starts a video from its beginning at normal speed, so its place and speed are put back.
// Runs in the page itself for that. src/twitch/page-sync.js sets the attribute, and
// embed-settings.js does in Twitch's embedded player, for the multi-stream view.
(() => {
  'use strict';

  // Twitch's embedded player on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const CHECK_MS = 1000;
  // How long an error shows before each try. After the last, it's left alone until the player
  // has played for PLAYED_MS or the page changes, so an error a reload can't fix doesn't keep
  // the player reloading.
  const WAITS_MS = [2000, 5000, 15000, 30000, 60000];
  const PLAYED_MS = 30000;
  // How long a video's place is still put back after it plays again.
  const PUT_BACK_MS = 10000;
  const ON = "[data-skek-on~='autoReloadPlayer'], [data-skek-auto-reload]";
  const GATE = '[data-a-target="player-overlay-content-gate"]';
  // Twitch numbers its errors, #1000 to #5000. Whatever else that screen may say, with whatever
  // button, is left alone.
  const ERROR = /#[1-5]000\b/;
  const root = document.documentElement;

  let tries = 0;
  let shownSince = 0;
  let playingSince = 0;
  let page = '';
  // Where a video was and how fast it played: { seconds, speed }. Null on a live stream.
  let place = null;
  // Set by a reload, while the place is still to be put back.
  let putBackUntil = 0;

  const errorScreen = () => [...document.querySelectorAll(GATE)].find((gate) => ERROR.test(gate.textContent));

  // Twitch's player, found the way quality.js finds it, and the top of React's tree.
  function findPlayer() {
    const element = document.querySelector('.video-ref');
    const fiberKey = element && Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    let player = null;
    let top = null;
    for (let fiber = element?.[fiberKey]; fiber; fiber = fiber.return) {
      const found = fiber.memoizedProps?.mediaPlayerInstance;
      if (!player && found?.getPosition) player = found;
      top = fiber;
    }
    return { player, top };
  }

  // What gives Twitch's player its stream. It's not above the player in React's tree, so this
  // looks through all of it, which only happens on an error with no button.
  function findLoader() {
    const { player, top } = findPlayer();
    const left = player ? [top] : [];
    while (left.length) {
      const fiber = left.pop();
      const node = fiber.stateNode;
      if (typeof node?.setSrc === 'function' && node.props?.mediaPlayerInstance === player) return node;
      if (fiber.sibling) left.push(fiber.sibling);
      if (fiber.child) left.push(fiber.child);
    }
    return null;
  }

  function reload(screen) {
    const buttons = screen.querySelectorAll('button');
    if (buttons.length === 1) {
      buttons[0].click();
    } else if (!buttons.length) {
      // With a new pass from Twitch, since the old one is what it refused.
      Promise.resolve(findLoader()?.setSrc({ refreshAccessToken: true })).catch(() => {});
    }
  }

  // Remembers a video's place while there's no error, and puts it back after a reload. More than
  // once if need be: audio only loads the video again when it sees Twitch's reload.
  function keepPlace(now) {
    const { player } = findPlayer();
    if (!player) return;
    if (putBackUntil) {
      if (!place || now > putBackUntil) {
        putBackUntil = 0;
      } else if (player.getState() === 'Playing') {
        putBackUntil = Math.min(putBackUntil, now + PUT_BACK_MS);
        if (player.getPosition() < place.seconds - 1) {
          player.seekTo(place.seconds);
          player.setPlaybackRate(place.speed);
        }
      }
      return;
    }
    const length = player.getDuration();
    const seconds = player.getPosition();
    // A failed load leaves a video at 0, before the error shows.
    if (!(length > 0) || !Number.isFinite(length)) place = null;
    else if (seconds > 0) place = { seconds, speed: player.getPlaybackRate() };
  }

  function check() {
    const now = Date.now();
    if (page !== location.pathname) {
      page = location.pathname;
      tries = 0;
      place = null;
      putBackUntil = 0;
    }

    const screen = errorScreen();
    if (!screen) {
      shownSince = 0;
      const video = document.querySelector('.video-ref video');
      if (!video || video.paused || video.readyState < 3) playingSince = 0;
      else playingSince ||= now;
      if (playingSince && now - playingSince >= PLAYED_MS) tries = 0;
      keepPlace(now);
      return;
    }

    playingSince = 0;
    // Behind the stream view, a reload would start Twitch's stream playing under another one.
    if (!root.matches(ON) || document.getElementById('skek-view')) {
      shownSince = 0;
      return;
    }
    shownSince ||= now;
    // Offline, a try would only be wasted. The wait still counts, so it tries once back online.
    if (!navigator.onLine || tries >= WAITS_MS.length || now - shownSince < WAITS_MS[tries]) return;
    tries += 1;
    shownSince = 0;
    putBackUntil = Infinity;
    reload(screen);
  }

  setInterval(() => {
    try {
      check();
    } catch {
      // Twitch changed its player. Nothing to do.
    }
  }, CHECK_MS);
})();
