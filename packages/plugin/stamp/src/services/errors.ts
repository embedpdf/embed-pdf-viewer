import { PluginError } from '@embedpdf/core';

export const notFound = (what: string, id: string) =>
  new PluginError('not-found', 'stamp', `unknown ${what} '${id}'`);
