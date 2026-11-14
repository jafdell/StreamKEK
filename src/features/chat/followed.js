// The Show when you followed a channel setting. Typing /followed in Twitch's chat box answers above the
// box with the date you followed the channel, and your own card, which opens from your name in chat,
// says it too. Nothing is sent to chat: the command is taken out of the box before Twitch sees it.
// Twitch only tells the date to whoever followed, so this asks its API with your sign-in, as Twitch's
// own page does. Nothing is saved. If Twitch's markup changes, the command reaches Twitch, which says
// it doesn't know it, and the card stays as it was.
// This loads after emotes.js, for the channel in the address.
(() => {
  'use strict';

  const COMMAND = '/followed';

  // The chat box keeps an invisible character in its text.
  const isCommand = (text) => text.replace(/﻿/g, '').trim().toLowerCase() === COMMAND;

  const count = (number, unit) => `${number} ${unit}${number === 1 ? '' : 's'}`;

  const dayNumber = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

  // In whole years and months, or in days when it's under a month, by the calendar where you are.
  // Empty for today.
  function timeSince(from, now) {
    let months = (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth();
    if (now.getDate() < from.getDate()) months -= 1;
    if (months < 1) {
      const days = dayNumber(now) - dayNumber(from);
      return days < 1 ? '' : count(days, 'day');
    }
    const years = Math.floor(months / 12);
    return [years && count(years, 'year'), months % 12 && count(months % 12, 'month')].filter(Boolean).join(' and ');
  }

  // Twitch's answer about a channel, for the person signed in. `login` stands in for a missing name.
  function followedFrom(data, login) {
    const user = data?.user;
    if (!user) return { state: 'failed' };
    const name = typeof user.displayName === 'string' && user.displayName ? user.displayName : login;
    const at = new Date(user.self?.follower?.followedAt ?? NaN);
    return Number.isNaN(at.getTime()) ? { state: 'notFollowing', name } : { state: 'following', name, at };
  }

  // The date as this browser's language writes it.
  const dateText = (date, locale) => date.toLocaleDateString(locale, { dateStyle: 'long' });

  function answerText(result, now, locale) {
    if (result.state === 'signedOut') return 'Sign in to Twitch to see when you followed a channel.';
    if (result.state === 'failed') return `Twitch didn't answer. Try ${COMMAND} again.`;
    if (result.state === 'notFollowing') return `You don't follow ${result.name}.`;
    const since = timeSince(result.at, now);
    return `You followed ${result.name} on ${dateText(result.at, locale)}${since ? `, ${since} ago` : ''}.`;
  }

  const cardText = (at, locale) => `Followed since ${dateText(at, locale)}`;

  skek.followed = { isCommand, timeSince, followedFrom, answerText, cardText };

  // Twitch's pages and its chat in the multi-stream view, but not that chat on other websites.
  if (window !== window.top && !location.ancestorOrigins[0]?.endsWith('.twitch.tv')) return;

  const ON = "[data-skek-on~='chatFollowedDate']";
  const CHAT_BOX = "[data-a-target='chat-input']";
  const SEND_BUTTON = "[data-a-target='chat-send-button']";
  // Everything under chat: the box and the buttons below it.
  const CHAT_INPUT = '.chat-input';
  const CARD = "[data-a-target='viewer-card']";
  // The top of a card: the name, which links to that person's channel, and under it a line for their
  // sub, if they have one. Each of Twitch's lines there is an icon and a text, as the one added here is.
  const CARD_TOP = '.viewer-card-header__display-name';
  const CARD_NAME = `${CARD_TOP} a[href]`;
  const HEART = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5 4.3 12.9a4.9 4.9 0 0 1 6.9-6.9l.8.8.8-.8a4.9 4.9 0 0 1 6.9 6.9L12 20.5Z"/></svg>';
  const QUERY = 'query($login:String!){user(login:$login){displayName self{follower{followedAt}}}}';
  const TIMEOUT_MS = 10_000;
  const NOTICE_MS = 10_000;
  const root = document.documentElement;

  const channelHere = () => skek.chatEmotes.channelFromPath(location.pathname);

  async function ask(channel) {
    const signIn = skek.twitchSignIn();
    if (!signIn) return { state: 'signedOut' };
    try {
      return followedFrom(await skek.twitchGql(QUERY, { login: channel }, AbortSignal.timeout(TIMEOUT_MS), signIn), channel);
    } catch {
      return { state: 'failed' };
    }
  }

  let notice = null;
  let noticeTimer = null;

  function closeNotice() {
    clearTimeout(noticeTimer);
    notice?.remove();
    notice = null;
  }

  // Above the chat box, where Twitch puts its own answers to commands. It goes away by itself.
  function showNotice(text) {
    closeNotice();
    const holder = document.querySelector(CHAT_INPUT);
    if (!holder) return;
    notice = document.createElement('div');
    notice.className = 'skek-followed';
    notice.setAttribute('role', 'status');
    const message = document.createElement('p');
    message.className = 'skek-followed__text';
    message.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'skek-followed__close';
    close.ariaLabel = 'Close';
    close.textContent = '✕';
    close.addEventListener('click', closeNotice);
    notice.append(message, close);
    holder.prepend(notice);
    noticeTimer = setTimeout(closeNotice, NOTICE_MS);
  }

  // Takes the command when Enter or the send button would send it. The box only takes changes that
  // arrive the way typing does, and these two empty its line on both sides of the cursor.
  function run(event, box) {
    if (!root.matches(ON) || !isCommand(box.textContent) || !document.querySelector(CHAT_INPUT)) return;
    const channel = channelHere();
    if (!channel) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    for (const inputType of ['deleteSoftLineBackward', 'deleteSoftLineForward']) {
      box.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }));
    }
    ask(channel).then((result) => {
      if (channelHere() === channel) showNotice(answerText(result, new Date()));
    });
  }

  // Captured on the window, to come before the page's own handling. Twitch's list of commands opens
  // while one is typed and takes Enter there, also on the window, and the box would send the command.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const box = event.target.closest?.(CHAT_BOX);
    if (box) run(event, box);
  }, true);
  window.addEventListener('click', (event) => {
    if (!event.target.closest?.(SEND_BUTTON)) return;
    const box = document.querySelector(CHAT_BOX);
    if (box) run(event, box);
  }, true);

  // What each open card was last asked about, so a card asks Twitch once.
  const asked = new WeakMap();

  // The channel a card is on, only when the card is your own.
  function ownCardChannel(card) {
    const login = card.querySelector(CARD_NAME)?.getAttribute('href').slice(1).toLowerCase();
    return login && login === skek.twitchLogin() ? channelHere() : null;
  }

  // Twitch can draw a card again, or show someone else in it, so the line is put back or taken away
  // to match. Someone you don't follow, like yourself, gets no line.
  function showOnCard() {
    const card = document.querySelector(CARD);
    if (!card) return;
    const channel = ownCardChannel(card);
    const line = card.querySelector('.skek-followed-card');
    if (line && line.dataset.skekChannel === channel) return;
    line?.remove();
    if (!channel) return;
    const held = asked.get(card);
    if (held?.channel !== channel) {
      const asking = { channel, text: '' };
      asked.set(card, asking);
      ask(channel).then((result) => {
        if (result.state !== 'following') return;
        asking.text = cardText(result.at);
        showOnCard();
      });
      return;
    }
    const top = card.querySelector(CARD_TOP);
    if (!held.text || !top) return;
    const added = document.createElement('div');
    added.className = 'skek-followed-card';
    added.dataset.skekChannel = channel;
    // Only ever the constant above.
    added.innerHTML = HEART;
    const text = document.createElement('p');
    text.textContent = held.text;
    added.append(text);
    top.append(added);
  }

  let scheduled = false;
  let watching = false;

  // Chat changes many times a second, so this looks for a card at most five times a second.
  const watcher = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (watching) showOnCard();
    }, 200);
  });

  // Only watches the page while the setting is on. src/twitch/page-sync.js sets the attribute.
  function update() {
    const on = root.matches(ON);
    if (on === watching) return;
    watching = on;
    if (on) {
      watcher.observe(root, { childList: true, subtree: true });
      showOnCard();
    } else {
      watcher.disconnect();
      closeNotice();
      document.querySelector('.skek-followed-card')?.remove();
    }
  }

  new MutationObserver(update).observe(root, { attributeFilter: ['data-skek-on'] });
  update();
})();
