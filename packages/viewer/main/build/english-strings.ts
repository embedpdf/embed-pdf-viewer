/**
 * Used in the npm pass. Emits the viewer's English words as `dist/strings/en.json`: the shape a
 * language takes in the `strings` config, key for key, so a translation of the whole viewer
 * starts from a copy of it. The `./strings/en.json` export and the CDN serve the same file.
 */
import type { Plugin } from 'vite';

import { en } from '../../chrome/src/locales/en';

export function englishStringsFile(): Plugin {
  return {
    name: 'embedpdf:english-strings',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'strings/en.json',
        source: `${JSON.stringify(en.translations, null, 2)}\n`,
      });
    },
  };
}
