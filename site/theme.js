// The home page's script, for what CSS alone can't work: picking a theme, the Theme animations
// switch, the slider and buttons on floating chat and dragging its window, the emote picker, and
// chat that keeps moving. The page reads the same without it.
(() => {
  'use strict';

  const root = document.documentElement;
  const browserColor = document.querySelector('meta[name="theme-color"]');
  const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // styles.css shows what only works with this script where <html> says it's running.
  root.classList.add('js');

  function span(className) {
    return Object.assign(document.createElement('span'), { className });
  }

  // Names the theme on <html>, as the extension does on its own pages, and palettes.css, a copy of
  // src/features/themes/palettes.css, gives the page that theme's colors. `base` is whether it's
  // a dark or a light one.
  function apply(theme, base) {
    root.dataset.skekTheme = theme;
    root.dataset.skekThemeBase = base;
    // The color a phone's browser gives its own bars.
    if (browserColor) browserColor.content = getComputedStyle(root).getPropertyValue('--skek-t-bg').trim();
  }

  // The themes are radio buttons drawn as small pictures, as in the settings window. They're off
  // in the page until they can work, and none is picked: the page starts in Twitch's own Dark.
  function followThemes(picker) {
    for (const radio of picker.querySelectorAll('input')) {
      radio.checked = radio.value === root.dataset.skekTheme;
      radio.addEventListener('change', () => apply(radio.value, radio.dataset.base));
      radio.disabled = false;
    }
  }

  // The Theme animations switch says on <html> whether the seasons and specials move, where the
  // extension says which of its settings are on, and effects.css looks there. Its row is hidden
  // until it can work.
  function followSwitch(toggle) {
    const say = () => root.setAttribute('data-skek-on', toggle.checked ? 'themeAnimations' : '');
    toggle.addEventListener('change', say);
    say();
    toggle.closest('[hidden]')?.removeAttribute('hidden');
  }

  // The slider on floating chat's bar fades the window's background, as the one in the extension
  // does. A browser can bring back where it was left, so the drawing is set from it right away.
  // It's off in the page until it can work.
  function followSlider(slider) {
    const shot = slider.closest('.shot');
    const fade = () => shot.style.setProperty('--skek-float-opacity', String(slider.value / 100));
    slider.addEventListener('input', fade);
    fade();
    slider.disabled = false;
  }

  // The two buttons on floating chat's bar, as in the extension: one lines the messages up on the
  // right or back on the left, and the other puts the background behind each message only.
  // They're off in the page until they can work.
  function followFloatButtons(align, messages) {
    const shot = align.closest('.shot');
    const icon = align.querySelector('use');
    align.addEventListener('click', () => {
      const right = shot.dataset.floatAlign !== 'right';
      shot.dataset.floatAlign = right ? 'right' : 'left';
      icon.setAttribute('href', right ? '#i-align-right' : '#i-align-left');
      align.title = align.ariaLabel = right ? 'Line messages up on the left' : 'Line messages up on the right';
    });
    messages.addEventListener('click', () => {
      messages.ariaPressed = String(shot.toggleAttribute('data-float-messages'));
    });
    align.disabled = false;
    messages.disabled = false;
  }

  // The floating chat window moves when dragged by its bar, and stays inside its stream. A window
  // that changes size puts it back where it started, since its place may no longer be inside.
  function makeDraggable(floating) {
    const bar = floating.querySelector('.skek-float__bar');
    let grip = null;
    bar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('input, button')) return;
      grip = { x: event.clientX - floating.offsetLeft, y: event.clientY - floating.offsetTop };
      bar.setPointerCapture(event.pointerId);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!grip) return;
      const area = floating.offsetParent;
      const left = Math.min(Math.max(event.clientX - grip.x, 0), area.clientWidth - floating.offsetWidth);
      const top = Math.min(Math.max(event.clientY - grip.y, 0), area.clientHeight - floating.offsetHeight);
      floating.style.left = `${left}px`;
      floating.style.top = `${top}px`;
    });
    const drop = () => { grip = null; };
    bar.addEventListener('pointerup', drop);
    bar.addEventListener('pointercancel', drop);
    // Only a change of width: a phone's window gets taller and shorter as its address bar goes.
    let width = innerWidth;
    addEventListener('resize', () => {
      if (innerWidth === width) return;
      width = innerWidth;
      floating.style.removeProperty('left');
      floating.style.removeProperty('top');
    });
  }

  // The empty chat box shows the name of the emote chat used last, as it does with the extension:
  // the one in the newest message that has any.
  function showLatestEmote(chat) {
    const box = chat.closest('.twchat')?.querySelector('[data-latest-emote]');
    const names = chat.querySelectorAll('.emote-name');
    if (box && names.length) box.textContent = names[names.length - 1].textContent;
  }

  // An emote in the picker is sent to the chat beside it. The buttons are off in the page until
  // they can work.
  function followEmotes(picker, lines) {
    for (const button of picker.querySelectorAll('button')) {
      button.disabled = false;
      button.addEventListener('click', () => {
        const line = document.createElement('p');
        line.className = 'twchat__line';
        line.dataset.own = '';
        const name = document.createElement('b');
        name.className = 'twchat__name--you';
        name.textContent = 'you';
        const emote = button.querySelector('img').cloneNode();
        emote.alt = '';
        const word = span('emote-name');
        word.textContent = button.dataset.name;
        line.append(name, ': ', emote, word);
        lines.append(line);
        showLatestEmote(lines);
      });
    }
  }

  // A chat taller than its messages gets them again above, as older ones, so it's full. Not the
  // ones a switch has hidden, or the visitor's own.
  function fill(chat) {
    const shown = [...chat.children].filter((message) => message.offsetHeight && !('own' in message.dataset));
    if (!shown.length) return;
    let height = [...chat.children].reduce((sum, message) => sum + message.offsetHeight, 0);
    for (let i = shown.length - 1, added = 0; height < chat.clientHeight && added < 80; i = (i || shown.length) - 1, added += 1) {
      chat.prepend(shown[i].cloneNode(true));
      height += shown[i].offsetHeight;
    }
  }

  // The chats in the drawings keep moving: each one's oldest message comes back as its newest,
  // except the visitor's own, which goes. Only the ones on screen, and not for someone who asked
  // for less motion.
  function runChats(chats) {
    const onScreen = new Set();
    const watcher = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) {
          onScreen.delete(target);
          continue;
        }
        onScreen.add(target);
        fill(target);
      }
    });
    for (const chat of chats) watcher.observe(chat);
    // A wider window makes some of them taller, a switch can take messages away, and another
    // number of streams changes their chat's height, over a moment.
    const refill = () => onScreen.forEach(fill);
    addEventListener('resize', refill);
    document.addEventListener('change', () => {
      refill();
      setTimeout(refill, 300);
    });
    setInterval(() => {
      if (lessMotion.matches || document.hidden) return;
      for (const chat of onScreen) {
        const oldest = chat.firstElementChild;
        if (!oldest || Math.random() > 0.65) continue;
        if ('own' in oldest.dataset) oldest.remove();
        else chat.append(oldest);
        showLatestEmote(chat);
      }
    }, 1300);
  }

  // Switching the extension off in the first drawing shows a Twitch channel, so that one is picked
  // there too. Switched back on, it's the same stream and chat, to compare.
  const power = document.getElementById('skek-on');
  const twitch = document.getElementById('watch-chess');
  if (power && twitch) {
    power.addEventListener('change', () => {
      if (!power.checked) twitch.checked = true;
    });
  }

  const themes = document.getElementById('themes-picker');
  if (themes) followThemes(themes);
  const animations = document.getElementById('theme-animations');
  if (animations) followSwitch(animations);
  const slider = document.getElementById('float-opacity');
  if (slider) followSlider(slider);
  const floatAlign = document.getElementById('float-align');
  const floatMessages = document.getElementById('float-messages');
  if (floatAlign && floatMessages) followFloatButtons(floatAlign, floatMessages);
  const floating = document.getElementById('float-window');
  if (floating) makeDraggable(floating);
  const emotes = document.querySelector('.skek-picker');
  const lines = document.getElementById('lab-lines');
  if (emotes && lines) followEmotes(emotes, lines);
  runChats(document.querySelectorAll('[data-live-chat]'));
})();
