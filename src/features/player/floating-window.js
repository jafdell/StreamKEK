// The window around floating chat, for both Twitch's player (player/modes.js) and the stream view
// (view-layouts.js): real fullscreen, plus a bar and edges to move and resize it, a slider for its
// background, and two switches: which edge the messages line up against, and whether the
// background is behind the whole window or only behind each message. The chat itself can't live
// in this window, because Twitch owns its chat and moving the stream view's would reload its
// frame. So floating-window.css places each chat under the window instead, and each chat's own
// CSS lines up its messages and draws their backgrounds: player/modes.css for Twitch's, and each
// site's frames/chat.css, which streams/frames/chat-settings.js tells what to show.
(() => {
  'use strict';

  const { el, icon } = skek.helpers;

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
  let onLook = null;
  // Fullscreen can take a moment to start, so losing it only counts after it was seen on.
  let fullscreenSeen = false;

  chrome.storage.local.get('floatingChat').then((stored) => {
    saved = stored.floatingChat ?? {};
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.floatingChat) return;
    saved = changes.floatingChat.newValue ?? {};
    // Another tab's switches, for a window that's open here.
    if (box) applyLook();
  });

  // How the messages look, for the chat's own CSS and for a frame's chat, which can't read <html>.
  function look() {
    return {
      align: saved.align === 'right' ? 'right' : 'left',
      messagesOnly: saved.messagesOnly === true,
      opacity: (saved.opacity ?? DEFAULT_OPACITY) / 100,
    };
  }

  function applyLook() {
    const { align, messagesOnly, opacity } = look();
    root.style.setProperty('--skek-float-opacity', String(opacity));
    if (box) {
      root.dataset.skekFloatAlign = align;
      root.toggleAttribute('data-skek-float-messages', messagesOnly);
      const alignButton = box.querySelector('.skek-float__button--align');
      alignButton.replaceChildren(icon(align === 'right' ? 'alignRight' : 'alignLeft'));
      alignButton.title = alignButton.ariaLabel = align === 'right' ? 'Line messages up on the left' : 'Line messages up on the right';
      box.querySelector('.skek-float__button--messages').ariaPressed = String(messagesOnly);
    }
    onLook?.();
  }

  function clearLook() {
    delete root.dataset.skekFloatAlign;
    root.removeAttribute('data-skek-float-messages');
  }

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

  const save = () => chrome.storage.local.set({ floatingChat: saved });

  // Shown at once, and saved when `keep` says the change is finished: a slider reports every step.
  function change(values, keep = true) {
    saved = { ...saved, ...values };
    applyLook();
    if (keep) save();
  }

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
    return el(
      'div',
      { class: 'skek-float' },
      el(
        'div',
        {
          class: 'skek-float__bar',
          on: {
            pointerdown: (event) => {
              if (!event.target.closest('input, button')) followPointer(event, moved);
            },
          },
        },
        el('span', { class: 'skek-float__title' }, 'Stream Chat'),
        // applyLook gives the first its icon and name, and says whether the second is on.
        el('button', {
          class: 'skek-float__button skek-float__button--align',
          type: 'button',
          on: { click: () => change({ align: look().align === 'right' ? 'left' : 'right' }) },
        }),
        el(
          'button',
          {
            class: 'skek-float__button skek-float__button--messages',
            type: 'button',
            title: 'Background behind each message only',
            ariaLabel: 'Background behind each message only',
            on: { click: () => change({ messagesOnly: !look().messagesOnly }) },
          },
          icon('messageBackgrounds'),
        ),
        el('input', {
          class: 'skek-float__opacity',
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          value: saved.opacity ?? DEFAULT_OPACITY,
          title: 'Background transparency',
          ariaLabel: 'Background transparency',
          on: {
            input: (event) => change({ opacity: Number(event.target.value) }, false),
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
  // onLook is called when how the messages look changes, for a chat in a frame to be told.
  function open(exit, lookChanged = null) {
    if (box) return;
    onExit = exit;
    onLook = lookChanged;
    box = buildBox();
    document.body.append(box);
    applyLook();
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
    onLook = null;
    clearLook();
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

  skek.floatingWindow = { open, close, look };
})();
