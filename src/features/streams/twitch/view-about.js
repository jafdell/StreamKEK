// The About section under a stream in the stream view, like the one under Twitch's own streams.
// On Kick it's the channel's followers, what it says about itself, its links and its panels. On
// YouTube it's the stream's own description, as under the video there, since that's where a
// YouTube streamer puts what a Twitch streamer keeps in the About section. Scrolling the stream
// view shows it, and view-about.css makes room for that.
// For a site whose entry in sites.js has loadsAbout. Its background reads the section from the
// site and passes on only what's safe to show: see channelAbout in kick/background/kick-api.js
// and in youtube/background/about.js. Nothing is saved, so it's asked for again in each tab.
(() => {
  'use strict';

  const shared = skek.streams;
  const { el, icon, send } = skek.helpers;
  const { state, siteOf, openStream, compact, linkParts } = shared;

  // How long an answer is shown before the site is asked again.
  const KEEP_MS = 10 * 60_000;
  const RETRY_MS = 30_000;
  const WORDS_CLASS = 'skek-about__bio';
  const FOLDED_CLASS = 'skek-about__bio--folded';
  // How many times taller than the fold a text has to be to stay folded.
  const FOLD_OVER = 1.5;

  // Each answer, by what it's about: { at, about }, with a null `about` while it failed.
  const answers = new Map();

  async function load(key, channel, site, videoId) {
    const known = answers.get(key);
    if (known && Date.now() - known.at < (known.about ? KEEP_MS : RETRY_MS)) return known.about;
    const answer = await send({ type: `${site.messagePrefix}:loadAbout`, channelId: channel.id, slug: channel.slug, videoId });
    const about = answer?.ok ? answer.about : null;
    answers.set(key, { at: Date.now(), about });
    return about;
  }

  const outside = (url, ...children) => el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, ...children);

  // A streamer's own words, with the addresses in them made into links. They start folded, and
  // unfoldShort takes the fold off the ones that fit anyway.
  function buildWords(text) {
    const words = el(
      'p',
      { class: `${WORDS_CLASS} ${FOLDED_CLASS}` },
      ...linkParts(text).map((part) => (part.url ? outside(part.url, part.text) : part.text)),
    );
    const toggle = el('button', { class: 'skek-about__more', type: 'button' }, 'Show more');
    toggle.addEventListener('click', () => {
      toggle.textContent = words.classList.toggle(FOLDED_CLASS) ? 'Show more' : 'Show less';
    });
    return [words, toggle];
  }

  // A text keeps its fold only when that hides a good part of it, not its last line or two. Needs
  // the section on the page and showing, to know how tall the text is. One that isn't showing
  // keeps its fold.
  function unfoldShort(section) {
    for (const words of section.querySelectorAll(`.${FOLDED_CLASS}`)) {
      if (words.clientHeight === 0 || words.scrollHeight > words.clientHeight * FOLD_OVER) continue;
      words.classList.remove(FOLDED_CLASS);
      words.nextElementSibling.remove();
    }
  }

  function buildPanel(panel) {
    const image = !panel.image ? null : el('img', { src: panel.image, alt: panel.title, loading: 'lazy', referrerPolicy: 'no-referrer' });
    return el(
      'div',
      { class: 'skek-about__panel' },
      panel.title ? el('h4', { class: 'skek-about__panel-title' }, panel.title) : null,
      image && panel.link ? outside(panel.link, image) : image,
      // A panel with only words can still lead somewhere.
      !image && panel.link ? outside(panel.link, panel.link) : null,
      panel.text ? el('p', { class: 'skek-about__panel-text' }, panel.text) : null,
    );
  }

  // What the stream says about itself, where the site's streams do.
  function buildStream(about) {
    if (!about.stream) return [];
    return [
      el('h3', { class: 'skek-about__title' }, 'About this stream'),
      el('div', { class: 'skek-about__box' }, el('div', { class: 'skek-about__words' }, ...buildWords(about.stream))),
    ];
  }

  function buildChannel(channel, about) {
    if (about.followers == null && !about.bio && !about.socials.length) return [];
    return [
      el(
        'h3',
        { class: 'skek-about__title' },
        `About ${channel.name}`,
        about.verified ? el('span', { class: 'skek-about__verified', title: 'Verified' }, icon('verified')) : null,
      ),
      el(
        'div',
        { class: 'skek-about__box' },
        el(
          'div',
          { class: 'skek-about__words' },
          about.followers == null ? null : el('p', { class: 'skek-about__followers' }, el('strong', {}, compact(about.followers)), ' followers'),
          ...(about.bio ? buildWords(about.bio) : []),
        ),
        about.socials.length === 0
          ? null
          : el('ul', { class: 'skek-about__socials' }, ...about.socials.map((social) => el('li', {}, outside(social.url, icon('external'), social.name)))),
      ),
    ];
  }

  function build(channel, about) {
    return [
      el('div', { class: 'skek-about__channel' }, ...buildStream(about), ...buildChannel(channel, about)),
      about.panels.length === 0 ? null : el('div', { class: 'skek-about__panels' }, ...about.panels.map(buildPanel)),
    ].filter(Boolean);
  }

  // Shows the open channel's About section, or none where the site has none. Changes nothing when
  // it's about the same channel as before, and the same stream where streams have a description.
  function showAbout() {
    const { view } = state;
    if (!view) return;
    const channel = state.channels.find((c) => c.id === state.openId);
    const site = channel && siteOf(channel);
    const videoId = site?.aboutPerStream ? openStream()?.videoId : undefined;
    // Where it's about the stream, an offline channel has none.
    const wanted = site?.loadsAbout && (videoId || !site.aboutPerStream) ? `${channel.id} ${videoId ?? ''}` : null;
    if (view.aboutFor === wanted) return;
    view.aboutFor = wanted;
    view.refs.about.replaceChildren();
    view.root.classList.remove('skek-view--about');
    view.refs.main.scrollTop = 0;
    if (!wanted) return;
    load(wanted, channel, site, videoId).then((about) => {
      // Closed, or on another channel by now.
      if (state.view !== view || view.aboutFor !== wanted) return;
      if (!about) {
        // So the next look at this channel asks again.
        view.aboutFor = undefined;
        return;
      }
      view.refs.about.replaceChildren(...build(channel, about));
      view.root.classList.add('skek-view--about');
      unfoldShort(view.refs.about);
    });
  }

  Object.assign(shared, { showAbout });
})();
