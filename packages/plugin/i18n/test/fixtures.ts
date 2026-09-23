import type { Locale } from '../src/contract';

export const en: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    commands: { zoom: { in: 'Zoom In' }, save: 'Save' },
    zoomLevel: 'Zoom Level ({level}%)',
    pages: { one: '{count} page', other: '{count} pages' },
  },
};
export const es: Locale = {
  code: 'es',
  name: 'Español',
  translations: { commands: { save: 'Guardar' } },
};
export const ar: Locale = { code: 'ar', name: 'العربية', dir: 'rtl', translations: {} };
