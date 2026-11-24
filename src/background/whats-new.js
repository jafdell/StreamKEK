// Notes when the browser has updated StreamKEK to another version, so the settings window can
// mark its What's new until that's been opened. Nothing is noted for a first install, or when the
// same version is loaded again, as the Reload button on the extensions page does.

// The version to note for what chrome.runtime.onInstalled says happened, or null.
export function updatedVersion({ reason, previousVersion }, version) {
  return reason === 'update' && previousVersion !== version ? version : null;
}

export function noteUpdate(details) {
  const version = updatedVersion(details, chrome.runtime.getManifest().version);
  if (version) chrome.storage.local.set({ whatsNewVersion: version });
}
