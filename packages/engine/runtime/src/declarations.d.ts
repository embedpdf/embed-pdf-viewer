declare module '@embedpdf/engine-runtime-wasm32' {
  const createModule: (opts?: Record<string, unknown>) => Promise<Record<string, any>>;
  export default createModule;
}

declare module '@embedpdf/engine-runtime-darwin-arm64';
declare module '@embedpdf/engine-runtime-darwin-x64';
declare module '@embedpdf/engine-runtime-linux-x64';
declare module '@embedpdf/engine-runtime-linux-arm64';
declare module '@embedpdf/engine-runtime-linuxmusl-x64';
declare module '@embedpdf/engine-runtime-linuxmusl-arm64';
declare module '@embedpdf/engine-runtime-win32-x64';
declare module '@embedpdf/engine-runtime-win32-arm64';
