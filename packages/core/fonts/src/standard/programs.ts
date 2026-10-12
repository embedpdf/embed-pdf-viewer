/**
 * The standard faces as programs a browser can load: each built-in face in an
 * OpenType font, loaded the first time it's asked for (about 20 KB each).
 */
import { STANDARD_FACES, type StandardFont } from '@embedpdf/engine-core/runtime';

import { decodeBase64 } from '../base64';
import { FACES } from './faces.generated';

const PROGRAMS: Readonly<Record<StandardFont, () => Promise<{ default: string }>>> = {
  courier: () => import('./programs/courier.generated'),
  'courier-bold': () => import('./programs/courier-bold.generated'),
  'courier-bold-oblique': () => import('./programs/courier-bold-oblique.generated'),
  'courier-oblique': () => import('./programs/courier-oblique.generated'),
  helvetica: () => import('./programs/helvetica.generated'),
  'helvetica-bold': () => import('./programs/helvetica-bold.generated'),
  'helvetica-bold-oblique': () => import('./programs/helvetica-bold-oblique.generated'),
  'helvetica-oblique': () => import('./programs/helvetica-oblique.generated'),
  'times-roman': () => import('./programs/times-roman.generated'),
  'times-bold': () => import('./programs/times-bold.generated'),
  'times-bold-italic': () => import('./programs/times-bold-italic.generated'),
  'times-italic': () => import('./programs/times-italic.generated'),
  symbol: () => import('./programs/symbol.generated'),
  'zapf-dingbats': () => import('./programs/zapf-dingbats.generated'),
};

/** A font program a browser can mount: its bytes, the CSS family it goes by, and its style. */
export interface FontProgram {
  /** SHA-256 of the bytes, hex. */
  readonly hash: string;
  /** The CSS family to mount it under ({@link fontProgramFamily}). */
  readonly family: string;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
  /** The bytes, the same object every time: don't change them. */
  load(): Promise<Uint8Array>;
}

/** The CSS family a mounted program goes by: named by its hash, it can't shadow any other font. */
export const fontProgramFamily = (hash: string): string => `epdf-${hash.slice(0, 16)}`;

const programs = new Map<StandardFont, FontProgram>();

export function standardFontProgram(font: StandardFont): FontProgram {
  const known = programs.get(font);
  if (known) return known;
  const hash = FACES[font].programHash;
  let bytes: Promise<Uint8Array> | null = null;
  const program: FontProgram = {
    hash,
    family: fontProgramFamily(hash),
    weight: STANDARD_FACES[font].weight,
    style: STANDARD_FACES[font].italic ? 'italic' : 'normal',
    load: () => {
      if (!bytes) {
        const loading = PROGRAMS[font]().then((module) => decodeBase64(module.default));
        // A load that failed is tried again next time.
        loading.catch(() => {
          if (bytes === loading) bytes = null;
        });
        bytes = loading;
      }
      return bytes;
    },
  };
  programs.set(font, program);
  return program;
}
