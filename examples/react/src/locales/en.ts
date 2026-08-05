import type { Locale } from '@embedpdf/plugin-i18n';

/**
 * The demo's English pack. Strings belong to the PRODUCT, not the plugin —
 * the `commands.*` namespace is ported verbatim from the v2 snippet packs so
 * existing translations carry over; `demo.*` is this example's own chrome.
 */
export const en: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    commands: {
      zoom: {
        in: 'Zoom In',
        out: 'Zoom Out',
        fitWidth: 'Fit to Width',
        fitPage: 'Fit to Page',
        automatic: 'Automatic',
        level: 'Zoom Level ({level}%)',
        inArea: 'Zoom In Area',
      },
      fullscreen: {
        enter: 'Enter Full Screen',
        exit: 'Exit Full Screen',
      },
      rotate: {
        clockwise: 'Rotate Clockwise',
        counterclockwise: 'Rotate Counter-Clockwise',
      },
      menu: 'Menu',
      sidebar: 'Sidebar',
      search: 'Search',
      comment: 'Comment',
      download: 'Download',
      print: 'Print',
      openFile: 'Open PDF',
      save: 'Save',
      settings: 'Settings',
      view: 'View',
      annotate: 'Annotate',
      shapes: 'Shapes',
      redact: 'Redact',
      fillAndSign: 'Fill and Sign',
      form: 'Form',
      pan: 'Pan',
      pointer: 'Pointer',
      undo: 'Undo',
      redo: 'Redo',
      copy: 'Copy',
      screenshot: 'Screenshot',
      nextPage: 'Next Page',
      previousPage: 'Previous Page',
    },
    demo: {
      starting: 'Starting viewer…',
      openFailed: 'Failed to open documents: {error}',
      split: 'split: add another pane',
      language: 'Language',
      documents: { one: '{count} document', other: '{count} documents' },
      zoom: 'Zoom',
      tools: 'Tools',
      info: 'Document info',
      chromeHint: 'measured toolbar — drag the right edge',
    },
  },
};
