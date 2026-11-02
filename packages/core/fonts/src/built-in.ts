/**
 * The programs every document's font list names that no document holds: the
 * 14 standard faces' and the last resort's. An engine answers
 * `doc.fonts.getProgram` and `downloadProgram` for them from here, the same
 * on every engine, without reading the document.
 */
import {
  STANDARD_FONTS,
  type BuiltInPrograms,
  type CodePointRange,
  type FontProgram,
  type FontProgramInfo,
  type StandardFont,
} from '@embedpdf/engine-core/runtime';

import { LAST_RESORT_HASH, LAST_RESORT_METRICS, lastResortFontProgram } from './last-resort';
import { standardFontMetrics } from './standard/metrics';
import { standardFontProgram } from './standard/programs';

/** The built-in programs' display hashes, as `fontListOf` names them. */
export const BUILT_IN_PROGRAMS: BuiltInPrograms = {
  standardDisplayHash: (name) => standardFontProgram(name).hash,
  lastResortDisplayHash: LAST_RESORT_HASH,
};

/** Every code point the last resort maps: U+0020 up, surrogates left out. */
const LAST_RESORT_COVERS: CodePointRange[] = [
  { start: 0x20, count: 0xd800 - 0x20 },
  { start: 0xe000, count: 0x110000 - 0xe000 },
];

const standardFontOfHash = (hash: string): StandardFont | undefined =>
  STANDARD_FONTS.find((name) => standardFontProgram(name).hash === hash);

/** Code points, in order, as ranges. */
function rangesOf(codePoints: readonly number[]): CodePointRange[] {
  const ranges: CodePointRange[] = [];
  for (const codePoint of [...codePoints].sort((left, right) => left - right)) {
    const last = ranges[ranges.length - 1];
    if (last && last.start + last.count === codePoint) last.count += 1;
    else if (!last || last.start + last.count < codePoint)
      ranges.push({ start: codePoint, count: 1 });
  }
  return ranges;
}

/** A built-in program's facts, as `getProgram` answers; undefined for any other hash. */
export function builtInProgramInfo(displayHash: string): FontProgramInfo | undefined {
  const standard = standardFontOfHash(displayHash);
  const program: FontProgram = {
    displayHash,
    sourceHash: null,
    embedded: 'none',
    format: null,
    embeddingPermission: null,
    canDownload: true,
  };
  if (standard) {
    const metrics = standardFontMetrics(standard);
    return {
      ...program,
      covers: rangesOf(metrics.codePoints),
      ascent: metrics.ascent,
      descent: metrics.descent,
    };
  }
  if (displayHash === LAST_RESORT_HASH) {
    return {
      ...program,
      format: 'truetype',
      embeddingPermission: 'installable',
      covers: LAST_RESORT_COVERS,
      ascent: LAST_RESORT_METRICS.ascent,
      descent: LAST_RESORT_METRICS.descent,
    };
  }
  return undefined;
}

/** A built-in program's bytes, as `downloadProgram` answers; undefined for any other hash. */
export function loadBuiltInProgram(displayHash: string): Promise<Uint8Array> | undefined {
  const standard = standardFontOfHash(displayHash);
  if (standard) return standardFontProgram(standard).load();
  if (displayHash === LAST_RESORT_HASH) return lastResortFontProgram().load();
  return undefined;
}
