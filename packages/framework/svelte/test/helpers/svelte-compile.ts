/**
 * A Vite plugin for the tests: compiles `.svelte` components and `.svelte.ts` modules (runes) with
 * `svelte/compiler`, for the browser and in development mode, so the runtime's checks are on.
 * Components keep their styles in the JavaScript. Modules lose their types through esbuild first,
 * because `compileModule` reads JavaScript.
 */
import { compile, compileModule } from 'svelte/compiler';
import { transformWithEsbuild, type Plugin } from 'vite';

const COMPONENT = /\.svelte$/;
const MODULE = /\.svelte\.(?:ts|js)$/;

export function svelteCompile(): Plugin {
  return {
    name: 'embedpdf:svelte-compile',
    enforce: 'pre',
    async transform(code, id) {
      const filename = id.split('?')[0]!;
      if (COMPONENT.test(filename)) {
        const result = compile(code, { filename, generate: 'client', dev: true, css: 'injected' });
        return { code: result.js.code, map: result.js.map };
      }
      if (MODULE.test(filename)) {
        const javascript = filename.endsWith('.ts')
          ? (await transformWithEsbuild(code, filename, { loader: 'ts' })).code
          : code;
        const result = compileModule(javascript, { filename, generate: 'client', dev: true });
        return { code: result.js.code, map: result.js.map };
      }
      return null;
    },
  };
}
