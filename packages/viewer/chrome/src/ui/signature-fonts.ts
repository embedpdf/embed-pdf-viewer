/**
 * The fonts a typed signature is drawn in: `plugins.signature.fonts`, or three handwriting fonts
 * (`@embedpdf/default-signature-fonts`, each a lazy chunk of your build). A font's file is read
 * the first time the signature maker needs it and registered on the engine once, under its key,
 * which a typed mark's `fontFamily` names; saving embeds the characters the mark uses.
 */
import {
  DEFAULT_SIGNATURE_FONTS,
  loadSignatureFont,
} from '@embedpdf/default-signature-fonts/library';
import { isLocalEngine, type Engine } from '@embedpdf/react/runtime';

import type { SignatureFont } from '../plugin-settings';

/** A font the maker offers: its key, what the picker shows, and how its bytes are read. */
export interface MarkFont {
  readonly key: string;
  readonly label: string;
  readonly bytes: () => Promise<Uint8Array>;
}

const DEFAULT_FONTS: readonly MarkFont[] = DEFAULT_SIGNATURE_FONTS.map((font) => ({
  key: font.key,
  label: font.label,
  bytes: () => loadSignatureFont(font.key),
}));

/** The bytes of an app's font: its `data`, or its `url` fetched. */
const bytesOf = (font: SignatureFont) => async (): Promise<Uint8Array> => {
  if (font.data) return new Uint8Array(font.data);
  if (!font.url) throw new Error(`[embedpdf] signature font "${font.key}" has no url or data`);
  const response = await fetch(font.url);
  if (!response.ok) throw new Error(`${font.url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** The fonts the maker offers: the app's, which replace the default ones, or the default ones. */
export const markFontsOf = (fonts: readonly SignatureFont[] | undefined): readonly MarkFont[] =>
  fonts
    ? fonts.map((font) => ({ key: font.key, label: font.label, bytes: bytesOf(font) }))
    : DEFAULT_FONTS;

/** Each engine's registrations, by font key: one read and one registration per font. */
const registrations = new WeakMap<Engine, Map<string, Promise<void>>>();

/**
 * Register `font` on `engine`, unless it already is: what a typed mark in it needs. Engines that
 * aren't local take no fonts from the browser, so nothing happens there. A failed read is tried
 * again next time.
 */
export function registerMarkFont(engine: Engine, font: MarkFont): Promise<void> {
  if (!isLocalEngine(engine)) return Promise.resolve();
  let byKey = registrations.get(engine);
  if (!byKey) registrations.set(engine, (byKey = new Map()));
  const known = byKey.get(font.key);
  if (known) return known;
  const registering = font
    .bytes()
    .then((data) => engine.fonts.register({ key: font.key, data }))
    .then(() => undefined);
  byKey.set(font.key, registering);
  registering.catch(() => byKey.delete(font.key));
  return registering;
}
