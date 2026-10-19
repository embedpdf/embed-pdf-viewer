/**
 * The fonts the engine comes with (Noto Sans Hebrew, Noto Naskh Arabic) as
 * startup fonts: their files in `@embedpdf/default-fallback-fonts`, read by
 * path like the deployment's own, and tried after them.
 */
import { createRequire } from 'node:module';

import { DEFAULT_FALLBACK_FONTS } from '@embedpdf/default-fallback-fonts/library';
import { FALLBACK_TIERS } from '@embedpdf/engine-core/runtime';
import type { StartupFontSpec } from '@embedpdf/engine-services';

/** The default fallback fonts but those whose key the deployment uses: a key of its own keeps its font. */
export function defaultFallbackFontSpecs(taken: ReadonlySet<string>): StartupFontSpec[] {
  const require = createRequire(import.meta.url);
  return DEFAULT_FALLBACK_FONTS.filter((font) => !taken.has(font.key)).map((font) => ({
    key: font.key,
    path: require.resolve(`@embedpdf/default-fallback-fonts/fonts/${font.file}`),
    familyName: font.familyName,
    weight: font.weight,
    italic: font.italic,
    fallback: true,
    tier: FALLBACK_TIERS.builtIn,
  }));
}
