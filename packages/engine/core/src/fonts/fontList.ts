/**
 * What a document's fonts allow: the one place the engine decides it. The
 * fork reports facts about each font program (its format, whether the PDF
 * holds all of it, its licence bits, its hash); these functions turn them
 * into the fonts `doc.fonts.list()` returns, the names `fontFamily` takes,
 * and the fonts `doc.fonts.resolve()` answers with. Both engines call them,
 * so a font allows the same on either.
 */
import { STANDARD_FACES, fontNameForFace, standardFamilyOf } from '../annotation/fontFaces';
import { STANDARD_FONTS, type FontName, type StandardFont } from '../annotation/primitives';
import type { DocCapability } from '../auth/scope/types';
import type {
  Font,
  FontFormat,
  FontList,
  FontProgram,
  FontRestriction,
  FontResolution,
  ResolvedFontRun,
} from '../dto/DocumentFonts';
import type { FontEmbeddingPermission, FontIdentityInfo } from '../dto/FontSpec';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/** A font program as the engine found it, before what it allows is decided. */
export interface FontProgramFacts {
  /** The program stream's object number; 0 when there is no program, or it is inline. */
  objectNumber: number;
  format: FontFormat | null;
  embedded: 'whole' | 'subset' | 'none';
  /** The /BaseFont without its subset tag. */
  postScriptName: string | null;
  /** What the OS/2 fsType grants; `null` when the program has no OS/2 table to say. */
  permission: FontEmbeddingPermission | 'restricted' | 'bitmap-only' | null;
  /** It loads, has glyphs and maps characters through a Unicode cmap. */
  mapsUnicode: boolean;
  /** SHA-256 (hex) of the decoded program; `null` without one. */
  sha256: string | null;
  /**
   * SHA-256 (hex) of what a browser loads for it: the program itself, or for a
   * Type 1, bare CFF or cmap-less program the display program the engine
   * builds from it; `null` when a browser can't draw it.
   */
  displaySha256: string | null;
  /** Line metrics in thousandths of the font size, as the layout reads them; 0 when it doesn't load. */
  ascent: number;
  descent: number;
}

/** A face the document's fonts are, and the programs behind it. */
export interface DocumentFaceFacts {
  familyName: string;
  weight: number;
  italic: boolean;
  programs: FontProgramFacts[];
}

/** One of the engine's fonts (registered locally, the server's on the cloud). */
export interface EngineFontFacts {
  key: string;
  identity: FontIdentityInfo;
  postScriptName: string | null;
  format: FontFormat;
  /** SHA-256 (hex) of the program the engine lays text out with. */
  sha256: string;
  /** Whether its bytes may go to a browser (the cloud's `serve`; always on locally). */
  served: boolean;
}

/**
 * The order fallback fonts are tried in, before their style is: the app's own
 * (the server's on the cloud) first, then the ones the engine comes with.
 */
export const FALLBACK_TIERS = { own: 0, builtIn: 1 } as const;
export type FallbackTier = (typeof FALLBACK_TIERS)[keyof typeof FALLBACK_TIERS];

/** Everything a font list is made from. */
export interface FontListFacts {
  faces: DocumentFaceFacts[];
  engineFonts: EngineFontFacts[];
  /**
   * Keys of the engine's fonts that fill in missing characters, by tier
   * (the app's, then the built-in ones), each in the order added.
   */
  fallbacks: string[];
}

/** The programs that ship with the engine's client: the standard faces' and the last resort's display programs. */
export interface BuiltInPrograms {
  standardDisplayHash(name: StandardFont): string;
  lastResortDisplayHash: string;
}

// ── programs ───────────────────────────────────────────────────────────────

const isSfnt = (format: FontFormat | null): boolean =>
  format === 'truetype' || format === 'opentype';

const allowsEditing = (permission: FontProgramFacts['permission']): boolean =>
  permission === 'installable' || permission === 'editable';

/**
 * Whether new text may be written with a document program: a whole TrueType
 * or OpenType program that maps characters through a Unicode cmap, whose
 * licence allows editing. What the writer can author with, nothing less.
 */
export function canChooseProgram(program: FontProgramFacts): boolean {
  return (
    program.embedded === 'whole' &&
    isSfnt(program.format) &&
    program.mapsUnicode &&
    allowsEditing(program.permission)
  );
}

/**
 * Whether a browser can draw a document program: it has a display program
 * (the program itself, or one the engine builds from it), and its licence,
 * when it states one, allows editing. A subset qualifies: a box that keeps it
 * shows its characters.
 */
function isDisplayable(program: FontProgramFacts): boolean {
  return (
    program.displaySha256 !== null &&
    (program.permission === null || allowsEditing(program.permission))
  );
}

/** Every reason a document program can't be chosen, or can't go to a browser. */
export function restrictionsOfProgram(program: FontProgramFacts): FontRestriction[] {
  const restrictions: FontRestriction[] = [];
  if (program.embedded === 'none') {
    restrictions.push(program.format === 'type3' ? 'unsupported-format' : 'not-embedded');
    return restrictions;
  }
  if (program.embedded === 'subset') restrictions.push('subset');
  if (!isSfnt(program.format)) restrictions.push('unsupported-format');
  else if (!program.mapsUnicode) restrictions.push('no-unicode-map');
  if (program.permission !== null && !allowsEditing(program.permission)) {
    restrictions.push('preview-and-print');
  }
  return restrictions;
}

function documentProgramOf(program: FontProgramFacts): FontProgram {
  const displayable = isDisplayable(program);
  return {
    displayHash: displayable ? program.displaySha256 : null,
    sourceHash: program.embedded === 'none' ? null : program.sha256,
    embedded: program.embedded,
    format: program.embedded === 'none' ? null : program.format,
    embeddingPermission:
      program.permission === 'restricted' || program.permission === 'bitmap-only'
        ? 'preview-and-print'
        : program.permission,
    canDownload: displayable,
  };
}

// New text uses a program it can author with first, then one a box keeps
// while it covers the text, then the rest; the order found stays otherwise.
const programRank = (program: FontProgramFacts): number =>
  canChooseProgram(program) ? 0 : isDisplayable(program) ? 1 : program.embedded !== 'none' ? 2 : 3;

// ── names ──────────────────────────────────────────────────────────────────

/** A weight's word in a style suffix, as font files name their weights; 400 has none. */
const WEIGHT_WORDS: Readonly<Record<number, string>> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: '',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

/** A face as a font dictionary describes it. */
export type DocumentFace = Pick<DocumentFaceFacts, 'familyName' | 'weight' | 'italic'>;

/**
 * The name a document program goes by, the name `fontFamily` takes: its
 * PostScript name, which says the style the family alone doesn't, else its
 * face's family with a style suffix in PDF's form that names the exact weight
 * (`'Inter'`, `'Inter,Medium'`, `'Inter,BoldItalic'`; `'Inter,450'` off the
 * hundreds).
 */
export function documentFontNameOf(face: DocumentFace, postScriptName: string | null): FontName {
  if (postScriptName) return postScriptName;
  const weight = WEIGHT_WORDS[face.weight] ?? String(face.weight);
  const style = `${weight}${face.italic ? 'Italic' : ''}`;
  return style ? `${face.familyName},${style}` : face.familyName;
}

/** A document font: every program the PDF draws under one name. */
export interface DocumentFontFacts {
  name: FontName;
  /** How its first program's font dictionary describes it. */
  face: DocumentFace;
  /** The program new text uses first, then the rest. */
  programs: FontProgramFacts[];
}

/**
 * The document's fonts, one per name. Editors describe one font differently
 * (one writes `/FontFamily` and `/FontWeight`, another leaves them out and the
 * engine reads them from the name), so the faces found can split one font in
 * two or hide one inside another; the name can't. Every program the PDF draws
 * under one name is one font, in the order first found, described by the face
 * of the program new text uses first. A program with neither a PostScript name
 * nor a family can't be named, so it isn't one.
 */
export function documentFontsOf(faces: readonly DocumentFaceFacts[]): DocumentFontFacts[] {
  const named = new Map<FontName, { face: DocumentFace; program: FontProgramFacts }[]>();
  for (const face of faces) {
    for (const program of face.programs) {
      if (!program.postScriptName && face.familyName === '') continue;
      const name = documentFontNameOf(face, program.postScriptName);
      const entries = named.get(name) ?? [];
      // The same program found under two faces is one program; one stream two
      // font dictionaries read differently (other encodings or widths) is two.
      const known = entries.some(({ program: other }) =>
        program.objectNumber > 0
          ? other.objectNumber === program.objectNumber &&
            other.displaySha256 === program.displaySha256
          : other.objectNumber === 0 &&
            other.embedded === program.embedded &&
            other.format === program.format &&
            other.sha256 === program.sha256,
      );
      if (!known) entries.push({ face, program });
      named.set(name, entries);
    }
  }
  return [...named].map(([name, entries]) => {
    const ranked = [...entries].sort(
      (left, right) => programRank(left.program) - programRank(right.program),
    );
    const { familyName, weight, italic } = ranked[0]!.face;
    return {
      name,
      face: { familyName, weight, italic },
      programs: ranked.map(({ program }) => program),
    };
  });
}

/** The standard font a /BaseFont names (`'Helvetica-Bold'`), if it is one. */
export function standardFontOfBaseFont(baseFont: string): StandardFont | undefined {
  const name = fontNameForFace(faceOfStandardBaseFont(baseFont));
  return (STANDARD_FONTS as readonly string[]).includes(name) ? (name as StandardFont) : undefined;
}

function faceOfStandardBaseFont(baseFont: string): {
  family: string;
  weight: number;
  italic: boolean;
} {
  const [family = '', style = ''] = baseFont.split(/[-,]/, 2);
  return {
    family,
    weight: /Bold/.test(style) ? 700 : 400,
    italic: /Italic|Oblique/.test(style),
  };
}

// ── the list ───────────────────────────────────────────────────────────────

/** A document font that is in fact a standard font the PDF only names: the standard font stands for it. */
function isStandardStandIn(font: DocumentFontFacts): boolean {
  return (
    standardFamilyOf(font.face.familyName) !== undefined &&
    font.programs.every((program) => program.embedded === 'none')
  );
}

function documentFontOf(font: DocumentFontFacts): Font {
  const first = font.programs[0];
  return {
    name: font.name,
    source: 'document',
    familyName: font.face.familyName,
    weight: font.face.weight,
    italic: font.face.italic,
    postScriptName: first?.postScriptName ?? null,
    canChoose: first ? canChooseProgram(first) : false,
    restrictions: first ? restrictionsOfProgram(first) : ['not-embedded'],
    programs: font.programs.map(documentProgramOf),
  };
}

function engineFontOf(font: EngineFontFacts): Font {
  const { identity } = font;
  const restrictions: FontRestriction[] = [];
  if (!identity.editingAuthorized) restrictions.push('preview-and-print');
  if (!font.served) restrictions.push('not-served');
  return {
    name: font.key,
    source: 'engine',
    familyName: identity.familyName,
    weight: identity.weight,
    italic: identity.italic,
    postScriptName: font.postScriptName,
    canChoose: identity.editingAuthorized,
    restrictions,
    programs: [
      {
        displayHash: font.sha256,
        sourceHash: font.sha256,
        embedded: 'none',
        format: font.format,
        embeddingPermission: identity.embeddingPermission,
        canDownload: font.served,
      },
    ],
  };
}

function standardFontOf(name: StandardFont, builtIn: BuiltInPrograms): Font {
  const face = STANDARD_FACES[name];
  return {
    name,
    source: 'standard',
    familyName: face.family,
    weight: face.weight,
    italic: face.italic,
    postScriptName: null,
    canChoose: true,
    restrictions: [],
    programs: [
      {
        displayHash: builtIn.standardDisplayHash(name),
        sourceHash: null,
        embedded: 'none',
        format: null,
        embeddingPermission: null,
        canDownload: true,
      },
    ],
  };
}

/** The fonts that can be named in a document, from what the engine found. */
export function fontListOf(facts: FontListFacts, builtIn: BuiltInPrograms): FontList {
  // A document that drew a box for a missing character holds the last
  // resort: it is the list's `lastResort`, not a font to write with.
  const isLastResort = (font: DocumentFontFacts) =>
    font.programs.some((program) => program.sha256 === builtIn.lastResortDisplayHash);
  const documentFonts = documentFontsOf(facts.faces)
    .filter((font) => !isStandardStandIn(font) && !isLastResort(font))
    .map(documentFontOf);
  return {
    fonts: [
      ...STANDARD_FONTS.map((name) => standardFontOf(name, builtIn)),
      ...facts.engineFonts.map(engineFontOf),
      ...documentFonts,
    ],
    fallbacks: [...facts.fallbacks],
    lastResort: {
      displayHash: builtIn.lastResortDisplayHash,
      sourceHash: null,
      embedded: 'none',
      format: 'truetype',
      embeddingPermission: 'installable',
      canDownload: true,
    },
  };
}

/** Who may have a program's bytes: a session that may write text in the document. */
export const TEXT_WRITING_CAPABILITIES = [
  'doc.annotate.modify',
  'doc.forms.fill',
  'doc.forms.modify',
  'doc.redact',
] as const satisfies readonly DocCapability[];

/** The program `list` names by its display hash: `NotFound` when none does. */
export function listedProgram(list: FontList, displayHash: string): FontProgram {
  const program = [...list.fonts.flatMap((font) => font.programs), list.lastResort].find(
    (candidate) => candidate.displayHash === displayHash,
  );
  if (!program) {
    throw new EngineError(
      EngineErrorCode.NotFound,
      `no font in this document has the program ${displayHash}`,
    );
  }
  return program;
}

/**
 * The program `downloadProgram(displayHash)` hands out: as {@link listedProgram},
 * and `InvalidArg` when it can't be downloaded.
 */
export function downloadableProgram(list: FontList, displayHash: string): FontProgram {
  const program = listedProgram(list, displayHash);
  if (!program.canDownload) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `the program ${displayHash} can't be downloaded`,
      {
        details: { field: 'displayHash' },
      },
    );
  }
  return program;
}

/**
 * The document program a write names by `fontFamily`: the program new text
 * uses first in the document font of that name. `undefined` when no document
 * font has that name; `choosable: false` when it has one that can't be chosen.
 */
export function documentProgramForName(
  facts: FontListFacts,
  name: string,
): { objectNumber: number; choosable: boolean; restrictions: FontRestriction[] } | undefined {
  const font = documentFontsOf(facts.faces).find(
    (candidate) => candidate.name === name && !isStandardStandIn(candidate),
  );
  if (!font) return undefined;
  const program = font.programs[0];
  if (!program) return { objectNumber: 0, choosable: false, restrictions: ['not-embedded'] };
  return {
    objectNumber: program.objectNumber,
    choosable: canChooseProgram(program) && program.objectNumber > 0,
    restrictions: restrictionsOfProgram(program),
  };
}

// ── resolution ─────────────────────────────────────────────────────────────

/** What the fork's resolver read says about one run. */
export interface ResolvedRunFacts {
  source: 'standard' | 'engine' | 'document-program' | 'document-font';
  /** The engine font's key, for `'engine'`. */
  engineFont: string | null;
  /** The program stream's object number, for document programs and a box's embedded font. */
  objectNumber: number;
  /**
   * What a browser loads for that program, as the font dictionary the run
   * draws with reads it (a program's `displaySha256`); `null` without one.
   */
  displaySha256: string | null;
  /** The font's /BaseFont: the standard name for `'standard'`. */
  baseFontName: string | null;
  familyName: string;
  weight: number;
  italic: boolean;
  degraded: boolean;
  /** Keys of the engine's fallback fonts, in the order tried for this run's style. */
  fallbacks: string[];
}

/** A resolver read's runs, named the way the font list names fonts. */
export function fontResolutionOf(
  runs: readonly ResolvedRunFacts[],
  missingCharacters: readonly string[],
  facts: FontListFacts,
  builtIn: BuiltInPrograms,
): FontResolution {
  const engineHash = new Map(facts.engineFonts.map((font) => [font.key, font.sha256]));
  // One stream two font dictionaries read differently is two programs: a run
  // names its own by both.
  const programKey = (objectNumber: number, displaySha256: string | null) =>
    `${objectNumber}:${displaySha256 ?? ''}`;
  const programFace = new Map<string, { face: DocumentFaceFacts; program: FontProgramFacts }>();
  for (const face of facts.faces) {
    for (const program of face.programs) {
      if (program.objectNumber > 0) {
        programFace.set(programKey(program.objectNumber, program.displaySha256), { face, program });
      }
    }
  }
  const resolvedRun = (run: ResolvedRunFacts): ResolvedFontRun => {
    const fallbacks = run.fallbacks.flatMap((key) => {
      const hash = engineHash.get(key);
      return hash ? [hash] : [];
    });
    const base = { weight: run.weight, italic: run.italic, substituted: run.degraded, fallbacks };
    const standard = run.baseFontName ? standardFontOfBaseFont(run.baseFontName) : undefined;
    if (
      run.source === 'standard' ||
      (run.source === 'document-font' && standard && !run.objectNumber)
    ) {
      const name: StandardFont = standard ?? 'helvetica';
      return { ...base, font: name, program: builtIn.standardDisplayHash(name) };
    }
    if (run.source === 'engine' && run.engineFont) {
      return { ...base, font: run.engineFont, program: engineHash.get(run.engineFont) ?? null };
    }
    const found = programFace.get(programKey(run.objectNumber, run.displaySha256));
    if (found) {
      return {
        ...base,
        font: documentFontNameOf(found.face, found.program.postScriptName),
        program: isDisplayable(found.program) ? found.program.displaySha256 : null,
      };
    }
    // The box's own font, which the PDF only names.
    return { ...base, font: run.baseFontName ?? run.familyName, program: null };
  };
  return { runs: runs.map(resolvedRun), missingCharacters: [...missingCharacters] };
}
