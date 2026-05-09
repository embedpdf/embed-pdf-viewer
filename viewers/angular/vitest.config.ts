import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { angularJsdomConfig } from '@embedpdf/vitest-config/angular-jsdom';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export default angularJsdomConfig({
  name: 'angular',
  tsconfig: resolve(__dirname, 'tsconfig.json'),
  setupFiles: ['src/test-setup.ts'],
});
