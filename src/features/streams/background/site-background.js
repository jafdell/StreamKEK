// What every site's background does the same way: polling on a timer, hiding followed channels and
// switching them off. How a site works out what's live is its own runPoll. The storage keys are the
// ones in ../sites.js, which a module can't import, so a test checks that they match.

const POLL_MINUTES = 1;
const STALE_MS = 60_000;

export function createSiteBackground({ keys, followsSetting, runPoll }) {
  let polling = null;

  function poll() {
    polling ??= runPoll().finally(() => {
      polling = null;
    });
    return polling;
  }

  async function pollIfTwitchOpen() {
    const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
    if (tabs.length) await poll();
  }

  // Turning it off clears what came from followed channels at once, keeping channels you added.
  async function setShowFollowed(enabled) {
    await chrome.storage.local.set({ [followsSetting]: enabled });
    if (enabled) return poll();
    const saved = await chrome.storage.local.get([keys.own, keys.live]);
    const own = saved[keys.own] ?? [];
    const live = saved[keys.live] ?? {};
    const kept = Object.fromEntries(own.filter((c) => live[c.id]).map((c) => [c.id, live[c.id]]));
    await chrome.storage.local.set({ [keys.followed]: {}, [keys.live]: kept });
  }

  // A hidden followed channel isn't checked or listed until you show it again. A channel you added
  // yourself can't be hidden: you remove it instead.
  async function hideChannel(id) {
    const saved = await chrome.storage.local.get([keys.own, keys.followed, keys.live, keys.hidden]);
    const followed = saved[keys.followed] ?? {};
    const channel = followed[id];
    if (!channel || (saved[keys.own] ?? []).some((c) => c.id === id)) return;
    const { [id]: _followed, ...otherFollowed } = followed;
    const { [id]: _live, ...otherLive } = saved[keys.live] ?? {};
    await chrome.storage.local.set({
      [keys.followed]: otherFollowed,
      [keys.live]: otherLive,
      [keys.hidden]: { ...saved[keys.hidden], [id]: channel },
    });
  }

  async function unhideChannel(id) {
    const saved = await chrome.storage.local.get(keys.hidden);
    const { [id]: _hidden, ...otherHidden } = saved[keys.hidden] ?? {};
    await chrome.storage.local.set({ [keys.hidden]: otherHidden });
    // A poll that's already running would still skip this channel, so run a fresh one.
    await polling?.catch(() => {});
    return poll();
  }

  async function refresh(force) {
    const saved = await chrome.storage.local.get(keys.status);
    const status = saved[keys.status];
    if (force || !status || Date.now() - status.checkedAt > STALE_MS) await poll();
  }

  // The messages every site answers. `prefix` is the site's messagePrefix in sites.js.
  function messageHandlers(prefix) {
    return {
      [`${prefix}:hide`]: async (msg) => {
        await hideChannel(msg.id);
        return { ok: true };
      },
      [`${prefix}:unhide`]: async (msg) => {
        await unhideChannel(msg.id);
        return { ok: true };
      },
      [`${prefix}:refresh`]: async (msg) => {
        await refresh(msg.force);
        return { ok: true };
      },
    };
  }

  function startPolling(alarmName) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === alarmName) pollIfTwitchOpen();
    });
    // Creating an alarm restarts its countdown, and this runs each time the service worker
    // wakes, so only create it when it's missing or has an old interval.
    chrome.alarms.get(alarmName).then((alarm) => {
      if (alarm?.periodInMinutes !== POLL_MINUTES) chrome.alarms.create(alarmName, { periodInMinutes: POLL_MINUTES });
    });
  }

  return { poll, setShowFollowed, messageHandlers, startPolling };
}

// A site's chat and player need your sign-in while framed inside Twitch, which browsers block as a
// cross-site cookie. This allows only that site's cookies, and only on twitch.tv. Browsers remove
// the exception when the extension is uninstalled.
export function allowCookiesOnTwitch(primaryPattern) {
  chrome.contentSettings.cookies
    .set({ primaryPattern, secondaryPattern: 'https://www.twitch.tv/*', setting: 'allow' })
    .catch((e) => console.error(`StreamKEK: could not allow cookies from ${primaryPattern} on Twitch`, e));
}
