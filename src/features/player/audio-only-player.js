// Audio only, the half in Twitch's own page: switches the player between a live stream's video
// and its audio-only version. audio-only.js has the button and says how the two talk.
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
  // A live stream's address in the player, which answers with the list of its versions.
  const LIVE = /^https:\/\/usher\.ttvnw\.net\/api\/(?:v2\/)?channel\/hls\/[^/?]+\.m3u8\?/;
  const root = document.documentElement;

  // What the audio came from, to go back to: { video, audio, login }.
  let source = null;
  let busy = false;
  let retryAt = 0;

  const wanted = () => root.hasAttribute('data-skek-audio-only');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // A stream's address holds a pass from Twitch that lasts 20 minutes, and Twitch's player can't
  // renew it: with an old one it only says the video is unavailable. Asking Twitch for a new one
  // would take the viewer's sign-in, which StreamKEK doesn't touch, so the page reloads instead
  // and Twitch gets its own. `audio` says what to play afterwards.
  // Not behind the stream view, and not twice in a minute, so a stream Twitch keeps refusing
  // can't keep the page reloading.
  function reloadPage(audio) {
    if (document.getElementById('skek-view')) return false;
    const last = lastReload();
    if (last && Math.abs(Date.now() - last.at) < RELOAD_GAP_MS) return false;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ at: Date.now(), audio }));
    } catch {
      return false;
    }
    location.reload();
    return true;
  }

  // The audio-only version's own playlist. Twitch lists that version only when asked to.
  // `status` is Twitch's answer when it refuses, which is 403 for a pass it doesn't accept.
  async function audioAddress(video) {
    const url = new URL(video);
    url.searchParams.set('allow_audio_only', 'true');
    const response = await fetch(url);
    if (!response.ok) return { status: response.status };
    const lines = (await response.text()).split('\n');
    const at = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF') && line.includes('"audio_only"'));
    const address = at === -1 ? '' : (lines[at + 1] ?? '').trim();
    return { address: address.startsWith('https://') ? address : '' };
  }

  // Waits for the player to say it has the address, since its answer comes a moment later.
  async function load(player, address, login) {
    player.load(address, undefined, login);
    const until = Date.now() + SETTLE_MS;
    while (Date.now() < until && player.getPath() !== address) await wait(100);
    return player.getPath() === address;
  }

  async function playAudio(player, video) {
    const login = player.getLoadedChannelLogin?.();
    const { address, status } = await audioAddress(video);
    // Switched off, or Twitch moved to another stream, while that was loading.
    if (!wanted() || player.getPath() !== video) return;
    if (address) {
      source = { video, audio: address, login };
      if (await load(player, address, login)) return;
    } else if (status === 403 && reloadPage(true)) {
      return;
    }
    // No audio-only version, or nothing worked: take the request back, so the button says so.
    source = null;
    root.removeAttribute('data-skek-audio-only');
  }

  async function showVideo(player) {
    // Asked first, because the player doesn't recover from loading an old pass.
    const response = await fetch(source.video);
    if (wanted() || player.getPath() !== source.audio) return;
    if (response.ok && (await load(player, source.video, source.login))) return;
    if (!response.ok && reloadPage(false)) return;
    retryAt = Date.now() + RETRY_MS;
  }

  async function check() {
    const player = findPlayer();
    const path = player?.getPath() ?? '';
    if (source && path === source.audio) {
      setState('on');
      if (!wanted()) await showVideo(player);
    } else if (LIVE.test(path)) {
      // Twitch loaded a stream itself: another channel, or this one again.
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
