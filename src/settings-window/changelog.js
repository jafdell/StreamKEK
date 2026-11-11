// Reads CHANGELOG.md, the file in the project's root that GitHub shows too, for the settings window's
// What's new category. It's the only copy of what changed, so it has to keep the shape this reads:
// a "## 1.5.0 - 2026-11-11" heading for each version, then one "- " line per change.
(() => {
  'use strict';

  // The version, in brackets or not, then the day it came out if there is one.
  const VERSION_HEADING = /^##\s+\[?(\d+(?:\.\d+)+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/;
  const CHANGE = /^[-*]\s+(\S.*)$/;

  // Every version with its changes, in the file's order. Anything else in the file is left out: its
  // title, its introduction, a comment, and a version with nothing under it.
  function parseChangelog(text) {
    const versions = [];
    let current = null;
    for (const line of text.split(/\r?\n/)) {
      const heading = line.match(VERSION_HEADING);
      const change = line.match(CHANGE);
      if (heading) {
        current = { version: heading[1], date: heading[2] ?? null, changes: [] };
        versions.push(current);
      } else if (line.startsWith('#')) {
        current = null;
      } else if (change && current) {
        current.changes.push(change[1].trim());
      } else if (current?.changes.length && /^\s+\S/.test(line)) {
        // A change that goes on over a second, indented line.
        current.changes[current.changes.length - 1] += ` ${line.trim()}`;
      }
    }
    return versions.filter((version) => version.changes.length);
  }

  // A change as the pieces to show, where ** was around the bold ones. The page builds elements from
  // these, so nothing in the file is ever read as HTML.
  function boldParts(text) {
    return text
      .split(/\*\*(.+?)\*\*/)
      .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
      .filter((part) => part.text);
  }

  // Empty if the file can't be read, which the settings window takes as nothing to show.
  function loadChangelog() {
    return fetch(chrome.runtime.getURL('CHANGELOG.md'))
      .then((response) => (response.ok ? response.text() : ''))
      .then(parseChangelog)
      .catch(() => []);
  }

  skek.changelog = { parseChangelog, boldParts, loadChangelog };
})();
