# @embedpdf/core-js-sandbox

## 3.0.0-next.19

## 3.0.0-next.18

### Patch Changes

- [#905](https://github.com/embedpdf/embed-pdf-viewer/pull/905) by [@bobsingor](https://github.com/bobsingor) – PDF JavaScript runs in Next.js apps again.
  - Turbopack, the default bundler in Next 16, failed with "Can't resolve '#quickjs-variant'", because it doesn't follow an `imports` target that names another package. `#quickjs-variant` now maps to two files of this package, `quickjs-variant/browser.js` and `quickjs-variant/wasmfile.js`, which re-export QuickJS's browser and wasm-file builds.
  - Production builds on Next before 16.4.1, webpack or Turbopack, broke QuickJS's browser build, so the sandbox never started. QuickJS 0.32.0 embeds its wasm as raw bytes in a template literal, and Next's minifier turned some of them into octal escapes ("Octal escape sequences are not allowed in template strings"). QuickJS is pinned to 0.31.0, which embeds the wasm as base64.

  Browsers still get the browser build, with no `.wasm` request, and Node the wasm-file one.

## 3.0.0-next.17

### Patch Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – The published package now picks its QuickJS build where it runs: `dist` keeps the `#quickjs-variant` import, so a browser bundler resolves QuickJS's browser build and Node its wasm-file build. Before, the build fixed the wasm-file build into `dist` for both.

## 3.0.0-next.16

## 3.0.0-next.15

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Align the JavaScript sandbox host types with the updated engine document and
  annotation references used by form scripts and dynamic stamps.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The `ScriptSandbox`/`ScriptSandboxFactory` structural contract moved to `@embedpdf/core-acrojs` (cycle fix); this package implements and re-exports it, and threads the new annots plane + `annotEffects` through the QuickJS bridge unchanged.

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the QuickJS-backed sandbox for PDF JavaScript. It provides deterministic, resource-bounded script execution for interactive forms without running document code directly in the host JavaScript context.
