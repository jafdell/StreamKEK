// Names the visitor's browser on the install buttons, which say "Add to Chrome" without this, and
// says so under them where StreamKEK can't be installed. It only reads what the browser tells
// every page: nothing is sent or saved. Every Chromium browser installs from the same store page,
// so the link stays as it is.
(() => {
  'use strict';

  const buttons = document.querySelectorAll('[data-install]');
  if (!buttons.length) return;

  const agent = navigator.userAgent;
  const brands = navigator.userAgentData?.brands.map(({ brand }) => brand) ?? [];
  const chromium = brands.includes('Chromium') || /\bChrome\//.test(agent);
  const mobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/.test(agent);

  // Brave says it's Chrome everywhere but here. The others put their name in one of the two lists.
  // A Chromium browser that fits none of these keeps "Add to Chrome".
  function browserName() {
    if (navigator.brave) return 'Brave';
    if (brands.includes('Microsoft Edge') || /\bEdg\//.test(agent)) return 'Edge';
    if (brands.includes('Opera') || /\bOPR\//.test(agent)) return 'Opera';
    if (brands.includes('Vivaldi') || /\bVivaldi\//.test(agent)) return 'Vivaldi';
    return null;
  }

  function addNote(button, text) {
    const note = document.createElement('p');
    note.className = 'small install-note';
    note.textContent = text;
    // After the button, or after the paragraph it's in.
    (button.parentElement.matches('p') ? button.parentElement : button).after(note);
  }

  let note = null;
  if (mobile) note = 'StreamKEK is for desktop browsers. Open this page on a computer to install it.';
  else if (!chromium) note = "StreamKEK needs Chrome, Brave or another Chromium browser. It can't be installed in this one.";

  const name = note ? null : browserName();
  for (const button of buttons) {
    if (name) button.textContent = `Add to ${name}`;
    if (note) addNote(button, note);
  }
})();
