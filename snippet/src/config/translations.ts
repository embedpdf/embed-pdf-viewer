import { ParamResolvers, Locale } from '@embedpdf/plugin-i18n';
import { State } from './types';
import { ZOOM_PLUGIN_ID } from '@embedpdf/plugin-zoom';

export const englishTranslations: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    zoom: {
      in: 'Zoom In',
      out: 'Zoom Out',
      fitWidth: 'Fit to Width',
      fitPage: 'Fit to Page',
      marquee: 'Marquee Zoom',
      menu: 'Zoom Menu',
    },
    pan: {
      toggle: 'Toggle Pan Mode',
    },
    pointer: {
      toggle: 'Toggle Pointer Mode',
    },
    capture: {
      screenshot: 'Screenshot',
    },
    document: {
      menu: 'Document Menu',
      open: 'Open',
      close: 'Close',
      print: 'Print',
      export: 'Export',
      fullscreen: 'Fullscreen',
    },
    panel: {
      sidebar: 'Sidebar',
      search: 'Search',
      comment: 'Comment',
      thumbnails: 'Thumbnails',
      outline: 'Outline',
    },
    page: {
      settings: 'Page Settings',
      single: 'Single Page',
      twoOdd: 'Two Page (Odd)',
      twoEven: 'Two Page (Even)',
      vertical: 'Vertical',
      horizontal: 'Horizontal',
      spreadMode: 'Spread Mode',
      scrollLayout: 'Scroll Layout',
      rotation: 'Page Rotation',
    },
    rotate: {
      clockwise: 'Rotate Clockwise',
      counterClockwise: 'Rotate Counter-Clockwise',
    },
    mode: {
      view: 'View',
      annotate: 'Annotate',
      shapes: 'Shapes',
      redact: 'Redact',
    },
    annotation: {
      text: 'Text',
      highlight: 'Highlight',
      strikeout: 'Strikethrough',
      underline: 'Underline',
      squiggly: 'Squiggly',
      rectangle: 'Rectangle',
      circle: 'Circle',
      line: 'Line',
      arrow: 'Arrow',
      polygon: 'Polygon',
      polyline: 'Polyline',
      ink: 'Ink',
      stamp: 'Stamp',
    },
    redaction: {
      area: 'Redact Area',
      text: 'Redact Text',
      applyAll: 'Apply All',
      clearAll: 'Clear All',
    },
    history: {
      undo: 'Undo',
      redo: 'Redo',
    },
  },
};

export const paramResolvers: ParamResolvers<State> = {
  'zoom.level': ({ state, documentId }) => {
    const zoomLevel = documentId
      ? (state.plugins[ZOOM_PLUGIN_ID]?.documents[documentId]?.currentZoomLevel ?? 1)
      : 1;
    return {
      level: Math.round(zoomLevel * 100),
    };
  },
};
