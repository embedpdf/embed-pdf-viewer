import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const SRC = 'src';
const DIST = 'dist';
// One package name, one API, TWO physical graphs (see src/shared.ts). The
// browser entry's graph must contain zero Node imports — enforced by
// `verify:browser-purity`, not by stubs or dead-code elimination.
const BROWSER_ENTRY = `${SRC}/index.browser.ts`;
const NODE_ENTRY = `${SRC}/index.node.ts`;

const optionalRuntimePackages = [
  '@embedpdf/pdf-runtime-wasm32',
  '@embedpdf/pdf-runtime-darwin-arm64',
  '@embedpdf/pdf-runtime-darwin-x64',
  '@embedpdf/pdf-runtime-linux-x64',
  '@embedpdf/pdf-runtime-linux-arm64',
  '@embedpdf/pdf-runtime-linuxmusl-x64',
  '@embedpdf/pdf-runtime-linuxmusl-arm64',
  '@embedpdf/pdf-runtime-win32-x64',
  '@embedpdf/pdf-runtime-win32-arm64',
];

const nodeExternal = (id) =>
  id === 'node:module' ||
  id === 'detect-libc' ||
  optionalRuntimePackages.some((pkg) => id === pkg || id.startsWith(`${pkg}/`));

// The browser graph may only reach the wasm package — anything else external
// appearing here would be a purity leak, so we do NOT silently allow it.
const browserExternal = (id) =>
  id === '@embedpdf/pdf-runtime-wasm32' || id.startsWith('@embedpdf/pdf-runtime-wasm32/');

const plugins = () => [typescript(), nodeResolve({ extensions: ['.js', '.ts'] })];

export default [
  {
    input: BROWSER_ENTRY,
    external: browserExternal,
    plugins: plugins(),
    output: { file: `${DIST}/index.browser.js`, format: 'esm', sourcemap: true },
  },
  {
    input: NODE_ENTRY,
    external: nodeExternal,
    plugins: plugins(),
    output: { file: `${DIST}/index.node.js`, format: 'esm', sourcemap: true },
  },
  {
    input: NODE_ENTRY,
    external: nodeExternal,
    plugins: [...plugins(), commonjs({ strictRequires: true })],
    output: { file: `${DIST}/index.node.cjs`, format: 'cjs', exports: 'named', sourcemap: true },
  },
  // Types are generated from the node entry: it is the superset surface and
  // the browser entry exports the same names with compatible signatures.
  {
    input: NODE_ENTRY,
    external: nodeExternal,
    plugins: [dts()],
    output: { file: `${DIST}/index.d.ts`, format: 'es' },
  },
  {
    input: NODE_ENTRY,
    external: nodeExternal,
    plugins: [dts()],
    output: { file: `${DIST}/index.d.cts`, format: 'es' },
  },
];
