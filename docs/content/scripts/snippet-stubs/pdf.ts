/**
 * `./pdf` in a snippet: the engine and documents the reader's app already has
 * (scripts/snippets.mjs). Snippets hand these to the viewer, so they carry the
 * engine's real types; the plugin list is the reader's own, in their adapter's
 * type, so any list will do.
 */
import type { Engine, OpenInput } from '@embedpdf/engine';

export declare const engine: Engine;
export declare const plugins: any[];

export declare const source: OpenInput;
export declare const report: OpenInput;
export declare const archive: OpenInput;
