/**
 * `#quickjs-variant` (`package.json` `imports`): the QuickJS build for where the code runs, the
 * browser one (`browser.js`) or the wasm-file one (`wasmfile.js`). Each is a file of this package
 * that re-exports the build, because Turbopack doesn't follow an `imports` target that names
 * another package.
 */
import type { QuickJSSyncVariant } from 'quickjs-emscripten-core';

declare const variant: QuickJSSyncVariant;
export default variant;
