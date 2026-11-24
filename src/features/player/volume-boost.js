// Volume boost on Twitch's own player, for a channel that's still quiet with Twitch's volume all
// the way up: a button beside Twitch's volume slider, and a slider of its own while it's on, from
// 100% to 400%.
// The video's sound goes through a gain and then a limiter, which holds the loud moments back so
// they don't distort. Nothing is saved: a reload turns it off, and so does going to another
// channel or video, which may be loud enough already.
// A video's sound can be taken over only once, and never given back. So it's taken the first time
// the boost is switched on, and switched off it goes straight to the speakers again. If something
// else took it first, like another extension, the button says so and nothing is boosted.
// Twitch's player only, not its embedded player in multi-stream, YouTube or Kick.
// This loads after emotes.js, for the channel in the address.
(() => {
  'use strict';

  const { el, onBodyReady, onPageChange } = skek.helpers;
  const { theatreItems, buildButton } = skek.playerButtons;

  const BOOST_CLASS = 'skek-boost';
  const SLIDER_HIDDEN_CLASS = `${BOOST_CLASS}--slider-hidden`;
  // The part of Twitch's volume that shows while the mouse is over it.
  const VOLUME_SLIDER = '.volume-slider__slider-container';
  const STATE = 'data-skek-volume-boost';
  const VIDEO = '.video-ref video';
  const VOLUME = "[data-a-target='player-volume-slider']";
  const LEFT_CONTROLS = '.player-controls__left-control-group';
  const MIN = 100;
  const MAX = 400;
  const STEP = 10;
  const START = 200;
  const SLIDER_KEYS = /^(Arrow|Page|Home$|End$)/;
  // Almost everything above the threshold is held back, starting gently.
  const LIMITER = { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.25 };
  // The limiter makes everything this much louder by itself, with the settings above, measured
  // with a quiet tone. The gain takes it off again, so 100% sounds like no boost.
  const LIMITER_GAIN = 1.3;
  // Long enough that moving the slider doesn't crackle.
  const GLIDE_SECONDS = 0.03;
  const root = document.documentElement;

  let on = false;
  let level = START;
  // What was playing when the boost was switched on: a channel, or 'video <id>'.
  let boostedFor = null;
  // { context, gain }, from the first time the boost is switched on.
  let audio = null;
  // Each video whose sound was taken: { node, boosted }.
  const taken = new WeakMap();
  let failed = false;

  function watching() {
    const { channelFromPath, videoFromPath } = skek.chatEmotes;
    const video = videoFromPath(location.pathname);
    return video ? `video ${video}` : channelFromPath(location.pathname);
  }

  function startAudio() {
    const context = new AudioContext();
    const gain = context.createGain();
    gain.connect(new DynamicsCompressorNode(context, LIMITER)).connect(context.destination);
    return { context, gain };
  }

  // The video's sound, or null where something else took it first.
  function takeSound(video) {
    try {
      return audio.context.createMediaElementSource(video);
    } catch {
      return null;
    }
  }

  // Sends each video's sound through the boost or straight to the speakers. A video Twitch adds
  // later is only taken while the boost is on. Changes nothing when nothing has changed.
  function route() {
    for (const video of document.querySelectorAll(VIDEO)) {
      let sound = taken.get(video);
      if (!sound) {
        if (!on) continue;
        sound = { node: takeSound(video), boosted: null };
        taken.set(video, sound);
      }
      if (!sound.node || sound.boosted === on) continue;
      sound.node.disconnect();
      sound.node.connect(on ? audio.gain : audio.context.destination);
      sound.boosted = on;
    }
  }

  // Whether there's a video here and none of them gave its sound.
  function nothingTaken() {
    const videos = [...document.querySelectorAll(VIDEO)];
    return videos.length > 0 && !videos.some((video) => taken.get(video)?.node);
  }

  function update() {
    const state = failed ? 'failed' : on ? 'on' : null;
    if (!state) root.removeAttribute(STATE);
    else if (root.getAttribute(STATE) !== state) root.setAttribute(STATE, state);
    const label = failed ? "Can't boost: something else has this video's sound" : on ? 'Turn off volume boost' : 'Boost volume';
    for (const item of document.querySelectorAll(`.${BOOST_CLASS}`)) {
      const button = item.querySelector('button');
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      const tooltip = failed ? label : 'Volume boost';
      const tipped = item.querySelector('[data-skek-tooltip]');
      if (tipped.dataset.skekTooltip !== tooltip) tipped.dataset.skekTooltip = tooltip;
      const slider = item.querySelector('input');
      if (Number(slider.value) !== level) slider.value = level;
      const fill = `${((level - MIN) / (MAX - MIN)) * 100}%`;
      if (slider.style.getPropertyValue('--skek-boost-fill') !== fill) slider.style.setProperty('--skek-boost-fill', fill);
      const text = `${level}%`;
      const value = item.querySelector(`.${BOOST_CLASS}__value`);
      if (value.textContent !== text) value.textContent = text;
    }
  }

  // Whether Twitch's volume slider is hidden, or on its way there. Twitch fades it in and out by
  // changing its class, to names that can't be relied on, so this reads where the fade is heading.
  function sliderHidden(slider) {
    const opacity = getComputedStyle(slider).opacity;
    const fade = slider.getAnimations().find((animation) => animation.transitionProperty === 'opacity');
    return Number(fade?.effect.getKeyframes().at(-1).opacity ?? opacity) < 0.5;
  }

  // Twitch keeps the room for its volume slider while the slider is hidden, which would leave a
  // gap before the button. So each button says when the slider before it is hidden, and
  // volume-boost.css takes the room away.
  // The room stays while the mouse is on the button, though. The mouse gets there from the sound
  // button by crossing the slider, which hides as it leaves, and the button would jump away from
  // under it.
  function followSliders() {
    for (const item of document.querySelectorAll(`.${BOOST_CLASS}`)) {
      const slider = item.previousElementSibling?.querySelector(VOLUME_SLIDER);
      if (slider && !watchedSliders.has(slider)) {
        watchedSliders.add(slider);
        sliderWatcher.observe(slider, { attributeFilter: ['class'] });
      }
      const hidden = !!slider && sliderHidden(slider);
      const roomGone = item.classList.contains(SLIDER_HIDDEN_CLASS);
      if (hidden && !roomGone && item.matches(':hover')) continue;
      if (roomGone !== hidden) item.classList.toggle(SLIDER_HIDDEN_CLASS, hidden);
    }
  }

  const sliderWatcher = new MutationObserver(followSliders);
  const watchedSliders = new WeakSet();

  function setGain() {
    audio.gain.gain.setTargetAtTime(level / 100 / LIMITER_GAIN, audio.context.currentTime, GLIDE_SECONDS);
  }

  function setOn(next) {
    if (next === on) return;
    on = next;
    audio ??= startAudio();
    setGain();
    route();
    // A video whose sound was taken is silent while this isn't running.
    audio.context.resume().catch(() => {});
    boostedFor = watching();
    failed = on && nothingTaken();
    if (failed) on = false;
    update();
  }

  function setLevel(next) {
    level = Math.min(MAX, Math.max(MIN, next));
    if (on) setGain();
    update();
  }

  function buildItem(theatre) {
    const button = buildButton(theatre, {
      classes: [],
      tooltip: 'Volume boost',
      icon: 'bolt',
      onClick: () => setOn(!on),
    });
    const slider = el('input', {
      type: 'range',
      min: String(MIN),
      max: String(MAX),
      step: String(STEP),
      'aria-label': 'Volume boost',
      on: {
        input: () => setLevel(Number(slider.value)),
        // The keys that move a slider, which Twitch's player has shortcuts on too.
        keydown: (event) => {
          if (SLIDER_KEYS.test(event.key)) event.stopPropagation();
        },
      },
    });
    const sliderBox = el('div', { class: `${BOOST_CLASS}__level` }, slider, el('span', { class: `${BOOST_CLASS}__value` }));
    return el('div', { class: BOOST_CLASS, on: { mouseleave: followSliders } }, button, sliderBox);
  }

  function addButtons() {
    // Only the player on a channel's page, which has chat beside it, as audio-only.js does.
    if (!document.querySelector('.right-column')) return;
    for (const theatre of theatreItems()) {
      const volume = theatre.closest("[data-a-target='player-controls']")?.querySelector(`${LEFT_CONTROLS} ${VOLUME}`);
      const controls = volume?.closest(LEFT_CONTROLS);
      if (!controls || controls.querySelector(`:scope > .${BOOST_CLASS}`)) continue;
      // After Twitch's volume, which is the item of the controls that holds its slider.
      [...controls.children].find((item) => item.contains(volume)).after(buildItem(theatre));
      update();
    }
  }

  function render() {
    addButtons();
    followSliders();
    if (!audio) return;
    const here = watching();
    if (on && here && here !== boostedFor) setOn(false);
    route();
    if (audio.context.state === 'suspended') audio.context.resume().catch(() => {});
  }

  onBodyReady(() => onPageChange(render));
})();
