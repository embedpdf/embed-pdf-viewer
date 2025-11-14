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
      automatic: 'Automatic',
      level: 'Zoom Level ({level}%)',
      inArea: 'Zoom In Area',
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
