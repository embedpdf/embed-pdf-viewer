import { SHAPES, type CachedReadKind, type TokenPin } from '@embedpdf/engine-core/wire';
import { engineValuesFor } from '../../src/services/EngineValues';
import { serverFontsFingerprint } from '../../src/services/ServerFonts';

/** The engine values of a test server with the fonts it comes with. */
export const ENGINE = engineValuesFor(serverFontsFingerprint([], []));

/** The pin a client puts in a `kind` token for a test server with the fonts it comes with. */
export function pinOf(kind: CachedReadKind): TokenPin {
  return { engine: ENGINE[kind], shape: SHAPES[kind] };
}
