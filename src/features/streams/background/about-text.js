// What every site's About section is cleaned with before the stream view shows it. A streamer
// writes all of it, so the page gets only plain text and addresses that open a website.

export const textOf = (value, most) => (typeof value === 'string' ? value.trim().slice(0, most) : '');

export function webUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
