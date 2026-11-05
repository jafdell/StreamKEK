// Settings that changed name after release, so nobody loses what they chose. Nothing else in the
// background writes settings: this only moves an old value across, once, then removes it.

const FLIPPED = { hideYouTubeLive: 'showYouTubeLive', hideKickLive: 'showKickLive' };

// What to save for the old settings found in `saved`. Each old one meant the opposite of its new one.
export function flippedSettings(saved) {
  const set = {};
  const remove = [];
  for (const [oldKey, newKey] of Object.entries(FLIPPED)) {
    if (!(oldKey in saved)) continue;
    set[newKey] = !saved[oldKey];
    remove.push(oldKey);
  }
  return { set, remove };
}

export async function moveRenamedSettings() {
  const { set, remove } = flippedSettings(await chrome.storage.local.get(Object.keys(FLIPPED)));
  if (!remove.length) return;
  await chrome.storage.local.set(set);
  await chrome.storage.local.remove(remove);
}
