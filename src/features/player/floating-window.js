// The window around floating chat, for both Twitch's player (player/modes.js) and the stream view
// (view-layouts.js): real fullscreen, plus a bar and edges to move and resize it and a slider for
// its background. The chat itself can't live in this window, because Twitch owns its chat and
// moving the stream view's would reload its frame. So floating-window.css places each chat under
// the window instead.
(() => {
  'use strict';

  const { el } = skek.helpers;

  const DEFAULT_WIDTH = 380;
  const DEFAULT_OPACITY = 70;
  const MIN_WIDTH = 240;
  const MIN_HEIGHT = 200;
  // Against the left edge, above a streamer's camera. Shares of the screen's height, because the
  // screen grows as fullscreen starts. The height includes the window's bar.
  const DEFAULT_TOP = 0.155;
  const DEFAULT_HEIGHT = 0.39;
  const EDGES = ['e', 'w', 's', 'se', 'sw'];
  // Twitch's chat and the stream view's, as floating-window.css places them.
  const CHAT = '.right-column--theatre, .skek-view--floating .skek-chat';
  const HOVER = 'data-skek-float-hover';
  const root = document.documentElement;

  let saved = {};
  let box = null;
  let onExit = null;
  // Fullscreen can take a moment to start, so losing it only counts after it was seen on.
  let fullscreenSeen = false;

  chrome.storage.local.get('floatingChat').then((stored) => {
    saved = stored.floatingChat ?? {};
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.floatingChat) saved = changes.floatingChat.newValue ?? {};
  });

  // Kept on screen, whatever size the screen was when it was saved.
  function currentRect() {
    const height = saved.height ?? Math.round(innerHeight * DEFAULT_HEIGHT);
    const width = Math.min(saved.width ?? DEFAULT_WIDTH, innerWidth);
    const fitted = Math.min(height, innerHeight);
    const x = saved.x ?? 0;
    const y = saved.y ?? Math.round(innerHeight * DEFAULT_TOP);
    return {
      x: Math.max(0, Math.min(x, innerWidth - width)),
      y: Math.max(0, Math.min(y, innerHeight - fitted)),
      width,
      height: fitted,
    };
  }

  function place() {
    const { x, y, width, height } = currentRect();
    root.style.setProperty('--skek-float-left', `${x}px`);
    root.style.setProperty('--skek-float-top', `${y}px`);
    root.style.setProperty('--skek-float-width', `${width}px`);
    root.style.setProperty('--skek-float-height', `${height}px`);
  }

  function setOpacity(percent) {
    saved = { ...saved, opacity: percent };
    root.style.setProperty('--skek-float-opacity', String(percent / 100));
  }

  const save = () => chrome.storage.local.set({ floatingChat: saved });

  // Follows the pointer until it's let go. Capturing it, and turning off the frames and video
  // under it in the CSS, keeps it from getting lost over them.
  function followPointer(event, rectFor) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const start = currentRect();
    const { clientX, clientY } = event;
    const move = (e) => {
      saved = { ...saved, ...rectFor(start, e.clientX - clientX, e.clientY - clientY) };
      place();
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      root.removeAttribute('data-skek-float-moving');
      save();
    };
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    root.setAttribute('data-skek-float-moving', '');
  }

  function moved(start, dx, dy) {
    return { ...start, x: start.x + dx, y: start.y + dy };
  }

  function resizedBy(edge) {
    return (start, dx, dy) => {
      const next = { ...start };
      if (edge.includes('e')) next.width = clampSize(start.width + dx, MIN_WIDTH, innerWidth - start.x);
      if (edge.includes('w')) {
        next.width = clampSize(start.width - dx, MIN_WIDTH, start.x + start.width);
        next.x = start.x + start.width - next.width;
      }
      if (edge.includes('s')) next.height = clampSize(start.height + dy, MIN_HEIGHT, innerHeight - start.y);
      return next;
    };
  }

  function clampSize(size, min, max) {
    return Math.max(min, Math.min(size, max));
  }

  // The bar shows while the mouse is over the chat under the window, which floating-window.css reads
  // from <html>. A frame's chat counts from the frame itself, the last thing here the mouse is over.
  function followHover(event) {
    root.toggleAttribute(HOVER, !!event.target.closest?.(CHAT));
  }

  const endHover = () => root.removeAttribute(HOVER);

  function buildBox() {
    const opacity = saved.opacity ?? DEFAULT_OPACITY;
    setOpacity(opacity);
    return el(
      'div',
      { class: 'skek-float' },
      el(
        'div',
        {
          class: 'skek-float__bar',
          on: {
            pointerdown: (event) => {
              if (!event.target.closest('input')) followPointer(event, moved);
            },
          },
        },
        el('span', { class: 'skek-float__title' }, 'Stream Chat'),
        el('input', {
          class: 'skek-float__opacity',
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          value: opacity,
          title: 'Background transparency',
          ariaLabel: 'Background transparency',
          on: {
            input: (event) => setOpacity(Number(event.target.value)),
            change: save,
          },
        }),
      ),
      ...EDGES.map((edge) =>
        el('div', {
          class: `skek-float__edge skek-float__edge--${edge}`,
          on: { pointerdown: (event) => followPointer(event, resizedBy(edge)) },
        }),
      ),
    );
  }

  async function enterFullscreen() {
    try {
      // A player already fullscreen would keep its video on top of the chat.
      if (document.fullscreenElement) await document.exitFullscreen();
      await root.requestFullscreen();
    } catch {
      // The browser said no, which leaves the mode filling the window instead.
    }
  }

  // A player's own fullscreen sits on top of ours, so it can take more than one step to get out.
  async function leaveFullscreen() {
    while (document.fullscreenElement) await document.exitFullscreen();
  }

  // onExit is called if fullscreen ends some other way, like Esc or a player's own fullscreen,
  // which a double-click on the video asks for. Chat can't show over that, so it counts as leaving.
  function open(exit) {
    if (box) return;
    onExit = exit;
    box = buildBox();
    document.body.append(box);
    place();
    addEventListener('resize', place);
    document.addEventListener('mouseover', followHover);
    root.addEventListener('mouseleave', endHover);
    enterFullscreen();
  }

  function close() {
    if (!box) return;
    box.remove();
    box = null;
    fullscreenSeen = false;
    removeEventListener('resize', place);
    document.removeEventListener('mouseover', followHover);
    root.removeEventListener('mouseleave', endHover);
    endHover();
    leaveFullscreen();
  }

  document.addEventListener('fullscreenchange', () => {
    if (!box) return;
    if (document.fullscreenElement === root) fullscreenSeen = true;
    else if (fullscreenSeen) onExit();
  });

  skek.floatingWindow = { open, close };
})();
