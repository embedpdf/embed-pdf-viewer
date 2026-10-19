import type { FontEmbeddingPermission } from './FontSpec';
import type { FontName } from '../annotation/primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';

/**
 * The fonts that can be named in a document: what `doc.fonts.list()` returns.
 *
 * - **Standard**: the 14 standard PDF fonts, drawn with the engine's built-in
 *   faces on every platform.
 * - **Engine**: fonts the engine has: registered on the local engine, the
 *   server's on the cloud.
 * - **Document**: fonts the PDF already has.
 *
 * A font is a face (family, weight, italic) backed by programs: the font files
 * behind it. Programs are named by hash, the CSS family a browser mounts one
 * under is named by its {@link FontProgram.displayHash}, and a hash is never a
 * permission: each document decides what may be done with a program.
 */
export interface FontList {
  /** The standard fonts, then the engine's in registration order, then the document's. */
  fonts: Font[];
  /**
   * The fonts that fill in missing characters: yours in the order you added
   * them, then the ones the engine comes with.
   */
  fallbacks: FontName[];
  /** The program that draws a box for a character no font has. */
  lastResort: FontProgram;
}

/** Where a font comes from. */
export type FontSource = 'standard' | 'engine' | 'document';

export interface Font {
  /** What `fontFamily` takes to write with this font. */
  name: FontName;
  source: FontSource;
  familyName: string;
  /** 100..900. */
  weight: number;
  italic: boolean;
  /** The PostScript name, such as `'MinionPro-Regular'`; `null` when it has none. */
  postScriptName: string | null;
  /** New text can be written in it: a box may name it. A box keeps the font it has either way. */
  canChoose: boolean;
  /** Why it can't be chosen, or why its first program can't be downloaded; empty when neither. */
  restrictions: FontRestriction[];
  /** The font files behind it; the first is the one new text uses. */
  programs: FontProgram[];
}

/** Why a font can't be chosen for new text, or its program can't go to a browser. */
export type FontRestriction =
  /** The PDF holds only the characters its text uses. */
  | 'subset'
  /** The PDF only names the font. */
  | 'not-embedded'
  /** The licence allows showing and printing, not editing. */
  | 'preview-and-print'
  /** A Type 1, CFF or Type 3 program: new text is written with TrueType or OpenType. */
  | 'unsupported-format'
  /** The program can't tell which glyph a character is (no Unicode cmap). */
  | 'no-unicode-map'
  /** A server font whose file stays on the server. */
  | 'not-served';

/** What a program is, from the font that holds it. */
export type FontFormat = 'truetype' | 'opentype' | 'cff' | 'type1' | 'type3';

export interface FontProgram {
  /**
   * SHA-256 (hex) of the file a browser loads: the program itself for TrueType
   * and OpenType, one the engine builds for the others. `null` when there is
   * none (a Type 3 font, a font the PDF only names). Programs are downloaded and
   * named by it.
   */
  displayHash: string | null;
  /**
   * SHA-256 (hex) of the file the engine lays text out with and puts in the PDF;
   * `null` when the document doesn't hold one (a standard font, one the PDF
   * only names).
   */
  sourceHash: string | null;
  embedded: 'whole' | 'subset' | 'none';
  /** `null` when nothing is embedded. */
  format: FontFormat | null;
  /** What the program's licence says; `null` when it says nothing. */
  embeddingPermission: FontEmbeddingPermission | null;
  /** Whether `downloadProgram()` hands out its display file. */
  canDownload: boolean;
}

/** A program and what an editor needs to lay text out the way the engine does. */
export interface FontProgramInfo extends FontProgram {
  /** The characters the engine can write with it, as code point ranges. */
  covers: CodePointRange[];
  /** How far the font reaches above the baseline, in thousandths of the font size. */
  ascent: number;
  /** How far below, in thousandths of the font size, as a negative number. */
  descent: number;
}

/** Code points `start` to `start + count - 1`. */
export interface CodePointRange {
  start: number;
  count: number;
}

/** A run of text and the font it asks for: by name, as a box does, or by face, as rich text does. */
export type FontResolveRun =
  | { text: string; fontFamily: FontName }
  | { text: string; family: string; weight: number; italic: boolean };

export interface FontResolveRequest {
  /** The box being edited: its own font counts, and it keeps it while it covers the text. */
  annotation?: AnnotationRef;
  runs: FontResolveRun[];
}

/** What `doc.fonts.resolve()` answers. */
export interface FontResolution {
  /** One per run asked about, in order. */
  runs: ResolvedFontRun[];
  /** Characters no font has, which the engine draws as boxes. Each is one grapheme. */
  missingCharacters: string[];
}

export interface ResolvedFontRun {
  /** The `name` of the font the engine draws the run in: the one asked for, or the one the box moves to. */
  font: FontName;
  weight: number;
  italic: boolean;
  /** `true` when it isn't the font asked for. */
  substituted: boolean;
  /** The program's display hash; `null` when a browser can't get one. */
  program: string | null;
  /** The fallback fonts' display hashes, in the order the engine tries them for this run's style. */
  fallbacks: string[];
}
