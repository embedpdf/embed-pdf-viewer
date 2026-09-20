/**
 * The viewer's BUILT-IN stamp library: `@embedpdf/default-stamps`, the
 * standard rubber stamps as one Acrobat-compatible PDF per locale.
 *
 * Delivery: the library ships INSIDE whatever ships this viewer. The package
 * exposes each locale as a lazy ES module (`@embedpdf/default-stamps/library`),
 * so it travels through the module graph like any other code — every bundler
 * splits it into a chunk served from the app's own origin, the CDN snippet
 * carries it as a sibling chunk in its folder, and nothing is fetched from a
 * third party. `stamps.defaultLibrary` overrides that:
 *   - `false`          → no built-in library, no request (air-gapped);
 *   - a URL template   → exactly that (`{locale}` slot), for self-hosted copies.
 *
 * Loading is LAZY (first open of the stamps panel, never at boot) and
 * locale-aware: the chrome locale leads, the browser languages break ties
 * for the locales the chrome does not translate itself, and a locale change
 * while a default library is loaded swaps it for the new one. The file names
 * itself (`/Title`, `Id: embedpdf-standard`), so no overrides are passed.
 */
import { LOCALES, loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { negotiateLocale } from '@embedpdf/react/i18n';
import type { StampCapability } from '@embedpdf/react/stamp';

/** The built-in library's PieceInfo id — excluded from persistence (it is
 *  loaded again on every first open, in the locale of that moment). */
export const DEFAULT_LIBRARY_ID = 'embedpdf-standard';

export type DefaultLibrarySource = false | string | undefined;

/** Which shipped locale to show for the chrome's locale + the browser's. */
export function resolveStampsLocale(chromeLocale: string): string {
  const languages = typeof navigator !== 'undefined' ? (navigator.languages ?? []) : [];
  return negotiateLocale(LOCALES, [chromeLocale, ...languages]) ?? 'en';
}

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** The library bytes for `locale`: your URL when you gave one, otherwise the
 *  copy that shipped with the viewer. Never anything else. */
const defaultLibraryBytes = (locale: string, source: string | undefined) =>
  source ? fetchBytes(source.replace('{locale}', locale)) : loadDefaultLibrary(locale);

/** Per workspace: the locale the default library was last brought to, and
 *  the in-flight work — the panel mounts and unmounts with the sidebar, so
 *  this cannot live in component state. */
const loads = new WeakMap<StampCapability, { locale: string; promise: Promise<void> }>();

/**
 * Bring the built-in library to `locale`. Idempotent per workspace and
 * locale; a locale change swaps the loaded default (remove, then import);
 * a default the user removed in this session stays removed — the locale is
 * recorded, nothing is re-added. An embedder that seeded a library under
 * the same id is left alone.
 */
export function ensureDefaultLibrary(
  stamp: StampCapability,
  locale: string,
  source: DefaultLibrarySource,
): Promise<void> {
  if (source === false) return Promise.resolve();
  const current = loads.get(stamp);
  if (current?.locale === locale) return current.promise;
  const run = async () => {
    await current?.promise.catch(() => undefined);
    const loaded = stamp.library(DEFAULT_LIBRARY_ID);
    if (loaded?.locale === locale) return;
    if (current && !loaded) return; // removed by the user this session
    if (loaded) await stamp.removeLibrary(DEFAULT_LIBRARY_ID);
    await stamp.importLibraryPdf(await defaultLibraryBytes(locale, source));
  };
  const promise = run();
  loads.set(stamp, { locale, promise });
  return promise;
}
