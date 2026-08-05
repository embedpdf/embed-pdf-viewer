/**
 * Environment-NEUTRAL platform vocabulary. This module must stay importable
 * from every graph (browser, worker, node) — so it carries no Node imports.
 * The node-only target detection (detect-libc) lives in `platform.node.ts`;
 * the browser graph pins `wasm32` in `index.browser.ts`.
 */
export type RuntimeTarget =
  | 'wasm32'
  | 'darwin-arm64'
  | 'darwin-x64'
  | 'linux-x64'
  | 'linux-arm64'
  | 'linuxmusl-x64'
  | 'linuxmusl-arm64'
  | 'win32-x64'
  | 'win32-arm64';

export function isNodeLike(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.versions?.node &&
    typeof process.platform === 'string'
  );
}

export function packageNameForTarget(target: RuntimeTarget): string {
  return `@embedpdf/engine-runtime-${target}`;
}
