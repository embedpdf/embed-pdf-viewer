import { BUILT_IN_PROGRAMS } from '@embedpdf/core-fonts';
import {
  EngineError,
  EngineErrorCode,
  STANDARD_FACES,
  canChooseProgram,
  faceForFontName,
  fontListOf,
  isStandardFontName,
  type AnnotationRef,
  type CodePointRange,
  type DocumentFaceFacts,
  type DocumentFontFacts,
  type FontFormat,
  type FontListFacts,
  type FontProgramFacts,
  type FontResolveRun,
  type ResolvedRunFacts,
  documentFontsOf,
  documentProgramForName,
} from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { FontRegistrar } from './FontRegistrar';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withPointerTable } from '../../runtime/memory/pointers';
import { readRanges } from '../../runtime/memory/ranges';
import { withI32Array, withScratch, withScratchN } from '../../runtime/memory/scratch';
import { readUtf16String, readUtf8String } from '../../runtime/memory/strings';
import { resolveAnnotIndexRaw } from '../annotations/internal/identity/resolveAnnotIndexRaw';
import type { AnnotationWriteContext } from '../annotations/internal/write/annotationWriteContext';

// `EPDF_FONT_FORMAT_*`.
const FORMATS: Readonly<Record<number, FontFormat | null>> = {
  0: null,
  1: 'truetype',
  2: 'opentype',
  3: 'cff',
  4: 'type1',
  5: 'type3',
};
// `EPDF_FONT_EMBEDDED_*`.
const EMBEDDED: Readonly<Record<number, FontProgramFacts['embedded']>> = {
  0: 'none',
  1: 'whole',
  2: 'subset',
};
// `EPDF_FONT_EMBEDDING_*`.
const PERMISSIONS: Readonly<Record<number, FontProgramFacts['permission']>> = {
  0: 'installable',
  1: 'editable',
  2: 'preview-and-print',
  3: 'restricted',
  4: 'bitmap-only',
};
// `EPDF_FONT_SOURCE_*`.
const SOURCES: Readonly<Record<number, ResolvedRunFacts['source']>> = {
  0: 'standard',
  1: 'engine',
  2: 'document-program',
  3: 'document-font',
};

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * A document's fonts as the fork finds them, read without loading a page:
 * the faces its dictionaries name and what each program is, the engine's
 * fonts, the fonts a write would draw text with, and programs by hash. Facts
 * only: what a font allows is engine-core's `fontListOf`.
 */
export class DocumentFontReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    private readonly fonts: FontRegistrar,
  ) {}

  /** Everything the document's font list is made from. */
  facts(): FontListFacts {
    return {
      faces: this.faces(),
      engineFonts: this.fonts.engineFontFacts(),
      fallbacks: this.fonts.fallbackKeys(),
    };
  }

  /** The faces the document's fonts are, with the facts about each program. */
  faces(): DocumentFaceFacts[] {
    return readDocumentFaces(this.runtime, this.session);
  }

  /**
   * The fonts a write would draw each run in, and the characters no font
   * has. A run naming its font by `fontFamily` asks for that font's face.
   */
  resolve(
    annotation: AnnotationRef | undefined,
    runs: readonly FontResolveRun[],
    facts: FontListFacts,
  ): { runs: ResolvedRunFacts[]; missingCharacters: string[] } {
    const { fn, mem } = this.runtime;
    const faces = runs.map((run) => this.faceOfRun(run, facts));
    const texts = runs.map((run) => mem.writeU16String(run.text));
    const families = faces.map((face) => mem.writeU16String(face.family));
    const annotPtr = annotation ? this.openAnnotation(annotation) : NULL_PTR;
    try {
      const resolution = withPointerTable(this.runtime, texts, (textTable) =>
        withPointerTable(this.runtime, families, (familyTable) =>
          withI32Array(
            mem,
            faces.map((face) => face.weight),
            (weights) =>
              withI32Array(
                mem,
                faces.map((face) => (face.italic ? 1 : 0)),
                (italics) =>
                  withI32Array(
                    mem,
                    faces.map((face) => face.program),
                    (programs) =>
                      fn.EPDFDoc_ResolveFonts(
                        this.session.requireDocPtr(),
                        annotPtr,
                        runs.length,
                        textTable,
                        familyTable,
                        weights,
                        italics,
                        programs,
                      ),
                  ),
              ),
          ),
        ),
      );
      if (!resolution) {
        throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_ResolveFonts failed');
      }
      try {
        return this.readResolution(resolution, runs.length);
      } finally {
        fn.EPDFFontResolution_Close(resolution);
      }
    } finally {
      if (annotPtr) fn.FPDFPage_CloseAnnot(annotPtr);
      for (const ptr of [...texts, ...families]) mem.free(ptr);
    }
  }

  private readResolution(
    resolution: Ptr,
    count: number,
  ): { runs: ResolvedRunFacts[]; missingCharacters: string[] } {
    const { fn, mem } = this.runtime;
    const runs: ResolvedRunFacts[] = [];
    for (let run = 0; run < count; run++) {
      const registered = fn.EPDFFontResolution_GetRegisteredFont(resolution, run);
      const fallbackCount = fn.EPDFFontResolution_GetFallbacks(resolution, run, NULL_PTR, 0);
      const fallbackIds = withScratch(mem, Math.max(1, fallbackCount) * 4, (out) => {
        fn.EPDFFontResolution_GetFallbacks(resolution, run, out, fallbackCount);
        return Array.from(
          { length: fallbackCount },
          (_, at) => Number(mem.peek(out, 'i32', at * 4)) >>> 0,
        );
      });
      runs.push({
        source: SOURCES[fn.EPDFFontResolution_GetSource(resolution, run)] ?? 'standard',
        engineFont: registered ? (this.fonts.keyForId(registered) ?? null) : null,
        objectNumber: fn.EPDFFontResolution_GetProgramObjNum(resolution, run),
        displaySha256: withScratch(mem, 32, (out) =>
          fn.EPDFFontResolution_GetProgramDisplayHash(resolution, run, out)
            ? hex(mem.readBytes(out, 32))
            : null,
        ),
        baseFontName:
          readUtf8String(mem, (buf, cap) =>
            fn.EPDFFontResolution_GetBaseFontName(resolution, run, buf, cap),
          ) || null,
        familyName:
          readUtf16String(mem, (buf, cap) =>
            fn.EPDFFontResolution_GetFamily(resolution, run, buf, cap),
          ) ?? '',
        weight: fn.EPDFFontResolution_GetWeight(resolution, run),
        italic: fn.EPDFFontResolution_IsItalic(resolution, run),
        degraded: fn.EPDFFontResolution_IsDegraded(resolution, run),
        fallbacks: fallbackIds.flatMap((id) => {
          const key = this.fonts.keyForId(id);
          return key ? [key] : [];
        }),
      });
    }
    const missingCharacters: string[] = [];
    const missingCount = fn.EPDFFontResolution_CountMissingCharacters(resolution);
    for (let index = 0; index < missingCount; index++) {
      const character = readUtf16String(mem, (buf, cap) =>
        fn.EPDFFontResolution_GetMissingCharacter(resolution, index, buf, cap),
      );
      if (character) missingCharacters.push(character);
    }
    return { runs, missingCharacters };
  }

  /**
   * The face a run asks for, found as a write finds it: a standard name's, an
   * engine font's, a document font's (with the program a write would name,
   * when new text can be written in it), or a family.
   */
  private faceOfRun(
    run: FontResolveRun,
    facts: FontListFacts,
  ): { family: string; weight: number; italic: boolean; program: number } {
    if (!('fontFamily' in run)) {
      return { family: run.family, weight: run.weight, italic: run.italic, program: 0 };
    }
    const name = run.fontFamily;
    if (isStandardFontName(name)) {
      const face = STANDARD_FACES[name];
      return { family: face.family, weight: face.weight, italic: face.italic, program: 0 };
    }
    const registered = this.fonts.describeOrUndefined(name);
    if (registered) {
      const { familyName, weight, italic } = registered;
      return { family: familyName, weight, italic, program: 0 };
    }
    const document = documentFontsOf(facts.faces).find((font) => font.name === name);
    if (document) {
      const { familyName, weight, italic } = document.face;
      const choice = documentProgramForName(facts, name);
      const program = choice?.choosable ? choice.objectNumber : 0;
      return { family: familyName, weight, italic, program };
    }
    const face = faceForFontName(name);
    return {
      family: face.family,
      weight: face.weight ?? 400,
      italic: face.italic ?? false,
      program: 0,
    };
  }

  private openAnnotation(ref: AnnotationRef): Ptr {
    const { pageIndex, index } = resolveAnnotIndexRaw(this.runtime, this.session, ref);
    const annotPtr = this.runtime.fn.EPDFPage_GetAnnotRaw(
      this.session.requireDocPtr(),
      pageIndex,
      index,
    );
    if (!annotPtr) {
      throw new EngineError(EngineErrorCode.NotFound, 'annotation not found');
    }
    return annotPtr;
  }

  /**
   * A program the document's fonts name, by its display hash: an engine
   * font's or a document program's. The coverage and metrics a browser draws
   * it with, and with `data`, the bytes it loads. Rejects with `NotFound` for
   * a hash neither names.
   */
  program(
    displayHash: string,
    data: boolean,
  ): { covers: CodePointRange[]; ascent: number; descent: number; bytes: Uint8Array | null } {
    const engineFont = this.fonts.programFor(displayHash);
    if (engineFont) return { ...engineFont.info(), bytes: data ? engineFont.bytes() : null };

    const program = this.faces()
      .flatMap((face) => face.programs)
      .find((candidate) => candidate.displaySha256 === displayHash && candidate.objectNumber > 0);
    if (!program) {
      throw new EngineError(EngineErrorCode.NotFound, `no font program ${displayHash}`);
    }
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    // By the hash: a stream two font dictionaries read differently is two programs.
    return withScratch(mem, 32, (hash) => {
      mem.writeBytes(hash, bytesOfHex(displayHash));
      const covers = readRanges(this.runtime, (out, capacity) =>
        fn.EPDFDoc_GetFontDisplayProgramCoverage(docPtr, hash, out, capacity),
      );
      let bytes: Uint8Array | null = null;
      if (data) {
        const length = fn.EPDFDoc_GetFontDisplayProgramData(docPtr, hash, NULL_PTR, 0);
        bytes = withScratch(mem, Math.max(1, length), (out) => {
          fn.EPDFDoc_GetFontDisplayProgramData(docPtr, hash, out, length);
          return mem.readBytes(out, length);
        });
      }
      return { covers, ascent: program.ascent, descent: program.descent, bytes };
    });
  }
}

/** The bytes a SHA-256's hex names. */
function bytesOfHex(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, at) =>
    parseInt(hex.slice(at * 2, at * 2 + 2), 16),
  );
}

/** The faces a document's fonts are, with the facts about each program (the fork's walk). */
export function readDocumentFaces(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
): DocumentFaceFacts[] {
  const { fn, mem } = runtime;
  const faces = fn.EPDFFontFaces_Load(session.requireDocPtr());
  if (!faces) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFFontFaces_Load failed');
  }
  try {
    const result: DocumentFaceFacts[] = [];
    const count = fn.EPDFFontFaces_Count(faces);
    for (let face = 0; face < count; face++) {
      const programs: FontProgramFacts[] = [];
      const programCount = fn.EPDFFontFaces_CountPrograms(faces, face);
      for (let program = 0; program < programCount; program++) {
        programs.push(programFacts(runtime, faces, face, program));
      }
      result.push({
        familyName:
          readUtf16String(mem, (buf, cap) => fn.EPDFFontFaces_GetFamily(faces, face, buf, cap)) ??
          '',
        weight: fn.EPDFFontFaces_GetWeight(faces, face),
        italic: fn.EPDFFontFaces_IsItalic(faces, face),
        programs,
      });
    }
    return result;
  } finally {
    fn.EPDFFontFaces_Close(faces);
  }
}

function programFacts(
  runtime: PdfRuntimeModule,
  faces: Ptr,
  face: number,
  program: number,
): FontProgramFacts {
  const { fn, mem } = runtime;
  const hashOf = (read: (out: Ptr) => boolean): string | null =>
    withScratch(mem, 32, (out) => (read(out) ? hex(mem.readBytes(out, 32)) : null));
  const sha256 = hashOf((out) => fn.EPDFFontFaces_GetProgramHash(faces, face, program, out));
  const displaySha256 = hashOf((out) =>
    fn.EPDFFontFaces_GetProgramDisplayHash(faces, face, program, out),
  );
  const metrics = withScratchN(mem, [4, 4], ([ascent, descent]) =>
    fn.EPDFFontFaces_GetProgramMetrics(faces, face, program, ascent, descent)
      ? { ascent: Number(mem.peek(ascent, 'f32')), descent: Number(mem.peek(descent, 'f32')) }
      : { ascent: 0, descent: 0 },
  );
  return {
    objectNumber: fn.EPDFFontFaces_GetProgramObjNum(faces, face, program),
    format: FORMATS[fn.EPDFFontFaces_GetProgramFormat(faces, face, program)] ?? null,
    embedded: EMBEDDED[fn.EPDFFontFaces_GetProgramEmbedded(faces, face, program)] ?? 'none',
    postScriptName:
      readUtf8String(mem, (buf, cap) =>
        fn.EPDFFontFaces_GetProgramPostScriptName(faces, face, program, buf, cap),
      ) || null,
    permission:
      PERMISSIONS[fn.EPDFFontFaces_GetProgramEmbeddingPermission(faces, face, program)] ?? null,
    mapsUnicode: fn.EPDFFontFaces_ProgramMapsUnicode(faces, face, program),
    sha256,
    displaySha256,
    ascent: Math.round(metrics.ascent * 1000),
    descent: -Math.round(metrics.descent * 1000),
  };
}

interface FontsSeen {
  /** The fork's fingerprint of the document's faces. */
  fingerprint: string;
  /** The document fonts a list shows, as JSON. */
  documentFonts: string;
}

/**
 * What each tracked session's fonts were when last read. A session is
 * tracked once something needs to know of every change to its fonts.
 */
const fontsSeen = new WeakMap<DocumentSession, FontsSeen>();

function fontsFingerprintOf(runtime: PdfRuntimeModule, session: DocumentSession): string {
  const { fn, mem } = runtime;
  return withScratch(mem, 32, (out) => {
    if (!fn.EPDFDoc_GetFontsFingerprint(session.requireDocPtr(), out)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_GetFontsFingerprint failed');
    }
    return hex(mem.readBytes(out, 32));
  });
}

/** The document fonts a list shows, as JSON: the engine's fonts don't change with a write. */
function listedDocumentFontsOf(runtime: PdfRuntimeModule, session: DocumentSession): string {
  const list = fontListOf(
    { faces: readDocumentFaces(runtime, session), engineFonts: [], fallbacks: [] },
    BUILT_IN_PROGRAMS,
  );
  return JSON.stringify(list.fonts.filter((font) => font.source === 'document'));
}

/** From now on, {@link fontsChangedSince} tells of every change to `session`'s fonts. */
export function trackFontChanges(runtime: PdfRuntimeModule, session: DocumentSession): void {
  if (fontsSeen.has(session)) return;
  fontsSeen.set(session, {
    fingerprint: fontsFingerprintOf(runtime, session),
    documentFonts: listedDocumentFontsOf(runtime, session),
  });
}

/**
 * Whether the fonts `session`'s list shows changed since this was last asked
 * (or since tracking began); false for a session not tracked. The fork's
 * fingerprint says whether anything about the faces moved, which on a layer
 * walks only what writes touched; only then is the list compared, since a
 * face the list doesn't show (a standard font's stand-in) moves it too.
 */
export function fontsChangedSince(runtime: PdfRuntimeModule, session: DocumentSession): boolean {
  const before = fontsSeen.get(session);
  if (!before) return false;
  const fingerprint = fontsFingerprintOf(runtime, session);
  if (fingerprint === before.fingerprint) return false;
  const documentFonts = listedDocumentFontsOf(runtime, session);
  fontsSeen.set(session, { fingerprint, documentFonts });
  return documentFonts !== before.documentFonts;
}

/**
 * The document program a write's `fontFamily` names, when it names a document
 * font: the program to write with, or why it can't be chosen.
 */
export function documentFontChoice(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  name: string,
): DocumentFontChoice | undefined {
  return documentProgramForName(
    { faces: readDocumentFaces(runtime, session), engineFonts: [], fallbacks: [] },
    name,
  );
}

export type DocumentFontChoice = NonNullable<ReturnType<typeof documentProgramForName>>;

/**
 * How a write finds the font a `fontFamily` names: one of the engine's fonts
 * by its key, one of the document's by its name. Every writer of `/DA` (free
 * text, redaction labels, form widgets) takes the same.
 */
export function fontWriteContext(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  fonts: FontRegistrar | undefined,
): Pick<
  AnnotationWriteContext,
  | 'resolveRegisteredFontId'
  | 'describeRegisteredFont'
  | 'describeFont'
  | 'documentProgramOf'
  | 'resolveDocumentFont'
> {
  // The document's fonts, read once per write the first time a name needs them.
  let documentFonts: DocumentFontFacts[] | undefined;
  const documentFontNamed = (name: string) =>
    (documentFonts ??= documentFontsOf(readDocumentFaces(runtime, session))).find(
      (font) => font.name === name,
    );
  return {
    ...(fonts
      ? {
          resolveRegisteredFontId: (key: string) => fonts.idFor(key),
          describeRegisteredFont: (key: string) => fonts.describeOrUndefined(key),
        }
      : {}),
    describeFont: (name: string) => {
      const registered = fonts?.describeOrUndefined(name);
      if (registered) return registered;
      const face = documentFontNamed(name)?.face;
      return face && { familyName: face.familyName, weight: face.weight, italic: face.italic };
    },
    documentProgramOf: (name: string) => {
      // A standard name or an engine font's key names that font first.
      if (isStandardFontName(name) || fonts?.describeOrUndefined(name)) return undefined;
      const program = documentFontNamed(name)?.programs[0];
      return program && canChooseProgram(program) && program.objectNumber > 0
        ? program.objectNumber
        : undefined;
    },
    resolveDocumentFont: (name: string) => documentFontChoice(runtime, session, name),
  };
}
