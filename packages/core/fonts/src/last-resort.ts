/**
 * The last-resort program: one box glyph that every code point maps to. It
 * goes last in every family list, so a character no other font has shows as
 * the box the engine draws for it, never as a font the browser picked.
 */
import { decodeBase64 } from './base64';
import { LAST_RESORT_HASH, LAST_RESORT_PROGRAM } from './last-resort.generated';
import { fontProgramFamily, type MountableFontProgram } from './standard/programs';

let program: MountableFontProgram | null = null;

export function lastResortFontProgram(): MountableFontProgram {
  if (!program) {
    let bytes: Uint8Array | null = null;
    program = {
      hash: LAST_RESORT_HASH,
      family: fontProgramFamily(LAST_RESORT_HASH),
      weight: 400,
      style: 'normal',
      // About a kilobyte: it ships inline.
      load: () => Promise.resolve((bytes ??= decodeBase64(LAST_RESORT_PROGRAM))),
    };
  }
  return program;
}

export { LAST_RESORT_HASH };
