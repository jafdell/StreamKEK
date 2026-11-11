// Audio only, the half in Twitch's own page: switches the player between the video of a live
// stream or a Twitch video and its audio-only version. audio-only.js has the button and says how
// the two talk.
// Twitch's player never lists audio only as a quality, even when the stream's list has it, so
// this loads that version's own playlist into the player, and the stream's address to go back.
// Reaching the player means going through React's internals, as quality.js does. If they change,
// there's no answer on <html> and the button doesn't show.
// Not in Twitch's embedded player, so not in multi-stream: a reload there would take every
// stream with it.
(() => {
  'use strict';

  const CHECK_MS = 500;
  const SETTLE_MS = 8000;
  const RETRY_MS = 5000;
  const RELOAD_GAP_MS = 60000;
  // sessionStorage: { at, audio }, when this tab last reloaded for a pass and what to play after.
  const STORE = 'skek-audio-only';
  // The address Twitch's player loads for a live stream or a video, which answers with the list
  // of its versions. A clip is a plain file with no such list.
  const STREAM = /^https:\/\/usher\.ttvnw\.net\/(?:api\/(?:v2\/)?channel\/hls|vod(?:\/v2)?)\/[^/?]+\.m3u8\?/;
  const root = document.documentElement;

  // What the audio came from, to go back to: { stream, audio, login }.
  let source = null;
  let busy = false;
  let retryAt = 0;

  const wanted = () => root.hasAttribute('data-skek-audio-only');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isVideo = (stream) => stream.startsWith('https://usher.ttvnw.net/vod/');

  // The same way quality.js finds it.
  function findPlayer() {
    const element = document.querySelector('.video-ref');
    const fiberKey = element && Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    for (let fiber = element?.[fiberKey]; fiber; fiber = fiber.return) {
      const player = fiber.memoizedProps?.mediaPlayerInstance;
      if (player?.getPath && player.load) return player;
    }
    return null;
  }

  function setState(state) {
    if (!state) root.removeAttribute('data-skek-audio-state');
    else if (root.dataset.skekAudioState !== state) root.dataset.skekAudioState = state;
  }

  function lastReload() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE));
    } catch {
      return null;
    }
  }

  // A stream's address holds a pass from Twitch, which lasts 20 minutes for a live stream and 20
  // hours for a video, and Twitch's player can't renew it: with an old one it only says the video
  // is unavailable. Asking Twitch for a new one would take the viewer's sign-in, which StreamKEK
  // doesn't touch, so the page reloads instead and Twitch gets its own. `audio` says what to play
  // afterwards, and a video starts again at `seconds`, which Twitch reads from the address.
  // Not behind the stream view, and not twice in a minute, so a stream Twitch keeps refusing
  // can't keep the page reloading.
  function reloadPage(audio, seconds) {
    if (document.getElementById('skek-view')) return false;
    const last = lastReload();
    if (last && Math.abs(Date.now() - last.at) < RELOAD_GAP_MS) return false;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ at: Date.now(), audio }));
    } catch {
      return false;
    }
    const url = new URL(location.href);
    if (seconds === null || !url.pathname.startsWith('/videos/')) {
      location.reload();
    } else {
      const whole = Math.floor(seconds);
      url.searchParams.set('t', `${Math.floor(whole / 3600)}h${Math.floor((whole % 3600) / 60)}m${whole % 60}s`);
      location.replace(url);
    }
    return true;
  }

  // The audio-only version's own playlist. Twitch lists that version only when asked to.
  // `status` is Twitch's answer when it refuses, which is 403 for a pass it doesn't accept.
  async function audioAddress(stream) {
    const url = new URL(stream);
    url.searchParams.set('allow_audio_only', 'true');
    const response = await fetch(url);
    if (!response.ok) return { status: response.status };
    const lines = (await response.text()).split('\n');
    const at = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF') && line.includes('"audio_only"'));
    const address = at === -1 ? '' : (lines[at + 1] ?? '').trim();
    return { address: address.startsWith('https://') ? address : '' };
  }

  // Loading starts a video from its beginning, at normal speed and playing, so its place, its
  // speed and a pause are put back. The player takes the place at once, but drops a speed or a
  // pause set before it plays, so those wait until it does.
  async function load(player, address, { stream, login }) {
    const paused = player.isPaused?.();
    const place = isVideo(stream) ? { seconds: player.getPosition(), speed: player.getPlaybackRate() } : null;
    player.load(address, undefined, login);
    if (place) player.seekTo(place.seconds);
    const until = Date.now() + SETTLE_MS;
    while (Date.now() < until && !(player.getPath() === address && player.getState() === 'Playing')) await wait(100);
    if (place) player.setPlaybackRate(place.speed);
    if (paused) player.pause();
    return player.getPath() === address;
  }

  const seconds = (player, stream) => (isVideo(stream) ? player.getPosition() : null);

  async function playAudio(player, stream) {
    const login = player.getLoadedChannelLogin?.();
    const { address, status } = await audioAddress(stream);
    // Switched off, or Twitch moved to another stream, while that was loading.
    if (!wanted() || player.getPath() !== stream) return;
    if (address) {
      source = { stream, audio: address, login };
      if (await load(player, address, source)) return;
    } else if (status === 403 && reloadPage(true, seconds(player, stream))) {
      return;
    }
    // No audio-only version, or nothing worked: take the request back, so the button says so.
    source = null;
    root.removeAttribute('data-skek-audio-only');
  }

  async function showVideo(player) {
    // Asked first, because the player doesn't recover from loading an old pass.
    const response = await fetch(source.stream);
    if (wanted() || player.getPath() !== source.audio) return;
    if (response.ok && (await load(player, source.stream, source))) return;
    if (!response.ok && reloadPage(false, seconds(player, source.stream))) return;
    retryAt = Date.now() + RETRY_MS;
  }

  async function check() {
    const player = findPlayer();
    const path = player?.getPath() ?? '';
    if (source && path === source.audio) {
      setState('on');
      if (!wanted()) await showVideo(player);
    } else if (STREAM.test(path)) {
      // Twitch loaded a stream itself: another channel or video, or this one again.
      source = null;
      setState('off');
      if (wanted()) await playAudio(player, path);
    } else {
      source = null;
      setState(null);
    }
  }

  async function tick() {
    if (busy || Date.now() < retryAt) return;
    busy = true;
    try {
      await check();
    } catch {
      // Offline, most likely.
      retryAt = Date.now() + RETRY_MS;
    } finally {
      busy = false;
    }
  }

  // A reload for audio: ask again, once.
  const last = lastReload();
  if (last?.audio && Math.abs(Date.now() - last.at) < RELOAD_GAP_MS) {
    root.setAttribute('data-skek-audio-only', '');
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ at: last.at, audio: false }));
    } catch {
      // Then a reload by hand within the minute starts in audio too.
    }
  }

  setInterval(tick, CHECK_MS);
  new MutationObserver(tick).observe(root, { attributeFilter: ['data-skek-audio-only'] });
})();
