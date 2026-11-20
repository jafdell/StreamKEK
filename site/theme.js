// The home page's script, for the controls in its drawings that CSS alone can't work: the theme
// picker and the Theme animations switch in the settings window, and the slider on floating chat.
// The page reads the same without it.
(() => {
  'use strict';

  // The choices of the Theme setting in src/settings.js, without Twitch's own Dark and Light.
  // `base` is whether a theme is a dark or a light one, and `group` its heading in the picker.
  const THEMES = [
    { value: 'midnight', label: 'Midnight', group: 'Themes', base: 'dark' },
    { value: 'slate', label: 'Slate', group: 'Themes', base: 'dark' },
    { value: 'dusk', label: 'Dusk', group: 'Themes', base: 'dark' },
    { value: 'forest', label: 'Forest', group: 'Themes', base: 'dark' },
    { value: 'ember', label: 'Ember', group: 'Themes', base: 'dark' },
    { value: 'aurora', label: 'Aurora', group: 'Themes', base: 'dark' },
    { value: 'synthwave', label: 'Synthwave', group: 'Themes', base: 'dark' },
    { value: 'terminal', label: 'Terminal', group: 'Themes', base: 'dark' },
    { value: 'paper', label: 'Paper', group: 'Themes', base: 'light' },
    { value: 'cotton-candy', label: 'Cotton Candy', group: 'Themes', base: 'light' },
    { value: 'winter', label: 'Winter', group: 'Seasons', base: 'dark' },
    { value: 'spring', label: 'Spring', group: 'Seasons', base: 'light' },
    { value: 'summer', label: 'Summer', group: 'Seasons', base: 'light' },
    { value: 'autumn', label: 'Autumn', group: 'Seasons', base: 'dark' },
    { value: 'christmas', label: 'Christmas', group: 'Specials', base: 'dark' },
    { value: 'halloween', label: 'Halloween', group: 'Specials', base: 'dark' },
  ];

  const root = document.documentElement;
  const browserColor = document.querySelector('meta[name="theme-color"]');

  function span(className) {
    return Object.assign(document.createElement('span'), { className });
  }

  // Names the theme on <html>, as the extension does on its own pages, and palettes.css, a copy of
  // src/features/themes/palettes.css, gives the page that theme's colors.
  function apply(theme) {
    root.dataset.skekTheme = theme.value;
    root.dataset.skekThemeBase = theme.base;
    // The color a phone's browser gives its own bars.
    if (browserColor) browserColor.content = getComputedStyle(root).getPropertyValue('--skek-t-bg').trim();
  }

  // A small picture of a theme: the page with its backdrop, a panel on it, a line of text, a link
  // and a button. It has data-skek-theme, so palettes.css gives it that theme's colors.
  function themeScene(theme) {
    const scene = span('swatch__scene');
    scene.dataset.skekTheme = theme.value;
    const main = span('swatch__main');
    main.append(span('swatch__text'), span('swatch__text swatch__text--link'), span('swatch__button'));
    scene.append(span('swatch__panel'), main);
    return scene;
  }

  function swatch(theme) {
    const option = document.createElement('label');
    option.className = 'swatch';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'theme';
    radio.value = theme.value;
    // So a reload can't bring back a choice the page no longer has.
    radio.autocomplete = 'off';
    radio.checked = theme.value === root.dataset.skekTheme;
    radio.addEventListener('change', () => apply(theme));
    const preview = span('swatch__preview');
    preview.append(themeScene(theme));
    const name = span('swatch__name');
    name.textContent = theme.label;
    option.append(radio, preview, name);
    return option;
  }

  // The settings window's own picker: radio buttons drawn as pictures, under a heading for each
  // group.
  function buildPicker(picker) {
    const parts = [];
    for (const group of new Set(THEMES.map((theme) => theme.group))) {
      const heading = document.createElement('p');
      heading.className = 'swatches__group';
      heading.textContent = group;
      const grid = document.createElement('div');
      grid.className = 'swatches__grid';
      grid.append(...THEMES.filter((theme) => theme.group === group).map(swatch));
      parts.push(heading, grid);
    }
    picker.replaceChildren(...parts);
  }

  // The slider on floating chat's bar fades the window's background, as the one in the extension
  // does. A browser can bring back where it was left, so the drawing is set from it right away.
  // It's off in the page until it can work.
  function followSlider(slider) {
    const shot = slider.closest('.shot');
    const fade = () => shot.style.setProperty('--skek-float-opacity', String(slider.value / 100));
    slider.addEventListener('input', fade);
    fade();
    slider.disabled = false;
  }

  // The Theme animations switch says on <html> whether the seasons and specials move, where the
  // extension says which of its settings are on, and effects.css looks there. Its row is hidden
  // until it can work.
  function followSwitch(toggle) {
    const say = () => root.setAttribute('data-skek-on', toggle.checked ? 'themeAnimations' : '');
    toggle.addEventListener('change', say);
    say();
    toggle.closest('[hidden]')?.removeAttribute('hidden');
  }

  const picker = document.getElementById('themes-picker');
  if (picker) buildPicker(picker);
  const slider = document.getElementById('float-opacity');
  if (slider) followSlider(slider);
  const animations = document.getElementById('theme-animations');
  if (animations) followSwitch(animations);
})();
