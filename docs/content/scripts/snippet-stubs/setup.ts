/**
 * `./setup` in a snippet: the reader's viewer setup, written once and shared by
 * their components (scripts/snippets.mjs). `features` is Angular's form of the
 * plugin list, spread into `provideEmbedPdf()`.
 */
import type { Engine, OpenInput } from '@embedpdf/engine';

export declare const engine: Engine;
export declare const plugins: any[];
export declare const features: any[];

export declare const contract: OpenInput;
