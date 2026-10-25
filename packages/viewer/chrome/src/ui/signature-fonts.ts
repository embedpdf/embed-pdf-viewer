/**
 * The fonts a typed signature is drawn in: `plugins.signature.fonts`, or three handwriting fonts
 * (`@embedpdf/default-signature-fonts`, each a lazy chunk of your build). A font's file is read
 * once, the first time it's needed: by the signature maker, which shows the typed name in it, and
 * by the stamp plugin, which registers it on the engine marks are written on (its asset engine)
 * the first time a mark names it. Saving embeds the characters the mark uses.
 */
import { fontProgramFamily, type MountableFontProgram } from '@embedpdf/core-fonts';
import {
  DEFAULT_SIGNATURE_FONTS,
  loadSignatureFont,
} from '@embedpdf/default-signature-fonts/library';
import type { StampFont } from '@embedpdf/react/stamp';

import type { SignatureFont } from '../plugin-settings';

/** A font the maker offers: its key, what the picker shows, and its bytes, read once. */
export interface MarkFont {
  readonly key: string;
  readonly label: string;
  readonly bytes: () => Promise<Uint8Array>;
}

/** `read`, called once: a failed read is tried again next time. */
function once(read: () => Promise<Uint8Array>): () => Promise<Uint8Array> {
  let reading: Promise<Uint8Array> | null = null;
  return () => {
    if (!reading) {
      const current = read();
      current.catch(() => {
        if (reading === current) reading = null;
      });
      reading = current;
    }
    return reading;
  };
}

const DEFAULT_FONTS: readonly MarkFont[] = DEFAULT_SIGNATURE_FONTS.map((font) => ({
  key: font.key,
  label: font.label,
  bytes: once(() => loadSignatureFont(font.key)),
}));

/** The bytes of an app's font: its `data`, or its `url` fetched. */
const bytesOf = (font: SignatureFont) => async (): Promise<Uint8Array> => {
  if (font.data) return new Uint8Array(font.data);
  if (!font.url) throw new Error(`[embedpdf] signature font "${font.key}" has no url or data`);
  const response = await fetch(font.url);
  if (!response.ok) throw new Error(`${font.url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** Each config's fonts, made once: the maker and the stamp plugin read the same files. */
const made = new WeakMap<readonly SignatureFont[], readonly MarkFont[]>();

/** The fonts the maker offers: the app's, which replace the default ones, or the default ones. */
export function markFontsOf(fonts: readonly SignatureFont[] | undefined): readonly MarkFont[] {
  if (!fonts) return DEFAULT_FONTS;
  let marks = made.get(fonts);
  if (!marks) {
    marks = fonts.map((font) => ({ key: font.key, label: font.label, bytes: once(bytesOf(font)) }));
    made.set(fonts, marks);
  }
  return marks;
}

/** The fonts as the stamp plugin's `fonts` setting takes them. */
export const stampFontsOf = (fonts: readonly SignatureFont[] | undefined): StampFont[] =>
  markFontsOf(fonts).map((font) => ({ key: font.key, load: font.bytes }));

const programs = new WeakMap<MarkFont, Promise<MountableFontProgram | null>>();

/**
 * A font as a program the browser mounts, named by its bytes' hash as every program is, so the
 * maker shows a typed name in the very face the mark is written in. `null` where the browser
 * can't hash (no Web Crypto outside a secure context): the name shows in the page's font.
 */
export function markFontProgram(font: MarkFont): Promise<MountableFontProgram | null> {
  let program = programs.get(font);
  if (!program) {
    program = (async () => {
      if (!globalThis.crypto?.subtle) return null;
      const bytes = await font.bytes();
      const digest = new Uint8Array(
        await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
      );
      const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return {
        hash,
        family: fontProgramFamily(hash),
        weight: 400,
        style: 'normal',
        load: async () => bytes,
      };
    })();
    programs.set(font, program);
    program.catch(() => programs.delete(font));
  }
  return program;
}
