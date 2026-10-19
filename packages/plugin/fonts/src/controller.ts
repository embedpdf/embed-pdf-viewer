import { PluginError, type PluginContext } from '@embedpdf/core';
import {
  fontProgramFamily,
  LAST_RESORT_HASH,
  lastResortFontProgram,
  standardFontProgram,
  standardFontStack,
  type MountableFontProgram,
} from '@embedpdf/core-fonts';
import {
  isLocalDocument,
  isStandardFontName,
  STANDARD_FACES,
  STANDARD_FONTS,
  type DocumentHandle,
  type Font,
  type FontList,
  type FontProgramInfo,
  type LocalDocumentFontsService,
  type StandardFont,
} from '@embedpdf/engine-core/runtime';

import type { FontCss, FontListChangedEvent, FontsCapability } from './contract';
import {
  cssFamilyList,
  fallbackHashes,
  fontForFace,
  fontNamed,
  foldFontList,
  standardFontForFace,
  styleOfProgram,
} from './model';

/** The document's fonts service, on an engine that has one. */
function documentFonts(doc: DocumentHandle): LocalDocumentFontsService {
  if (isLocalDocument(doc)) return doc.fonts;
  throw new PluginError('unsupported', 'fonts', "this document's engine doesn't list its fonts");
}

/** The hash prefix a program's CSS family names (`fontProgramFamily`), or undefined for another family. */
function programPrefixOf(cssFamily: string): string | undefined {
  const prefix = /^epdf-([0-9a-f]{16})$/.exec(cssFamily)?.[1];
  return prefix && !LAST_RESORT_HASH.startsWith(prefix) ? prefix : undefined;
}

let standardByHash: Map<string, StandardFont> | null = null;

/** The standard font whose built-in program has this hash. */
function standardFontOfHash(hash: string): StandardFont | undefined {
  standardByHash ??= new Map(STANDARD_FONTS.map((font) => [standardFontProgram(font).hash, font]));
  return standardByHash.get(hash);
}

/**
 * The fonts controller. The list is a mirror: read the first time something
 * asks for it, and read again when the engine says the document's fonts
 * changed. What a browser draws with comes from it: each program is built
 * once, so it loads once, and each font's CSS is built once while the list
 * stays the same, so it can be compared by identity.
 */
export function createFontsController(ctx: PluginContext<void>) {
  const listChanged = ctx.events.source<FontListChangedEvent>();
  const programs = new Map<string, MountableFontProgram>();
  const programInfos = new Map<string, Promise<FontProgramInfo>>();
  let css = new Map<string, FontCss>();

  const list = ctx.mirror<FontList | null>({
    name: 'fonts',
    onDemand: true,
    initial: () => null,
    load: async (doc) => ({ value: await documentFonts(doc).list() }),
    fold: foldFontList,
    changed: ({ next }) => {
      css = new Map();
      if (next) listChanged.emit({ fonts: next });
    },
  });

  /**
   * A program as a browser mounts it. The standard fonts' and the last
   * resort's ship with `@embedpdf/core-fonts`; every other program comes from
   * the engine, the first time it's mounted.
   */
  const programOf = (
    displayHash: string,
    style: { weight: number; italic: boolean },
  ): MountableFontProgram => {
    const standard = standardFontOfHash(displayHash);
    if (standard) return standardFontProgram(standard);
    if (displayHash === LAST_RESORT_HASH) return lastResortFontProgram();
    let program = programs.get(displayHash);
    if (!program) {
      let bytes: Promise<Uint8Array> | null = null;
      program = {
        hash: displayHash,
        family: fontProgramFamily(displayHash),
        weight: style.weight,
        style: style.italic ? 'italic' : 'normal',
        load: () => {
          if (!bytes) {
            const loading = Promise.resolve().then(() =>
              documentFonts(ctx.doc).downloadProgram(displayHash),
            );
            // A load that failed is tried again next time.
            loading.catch(() => {
              if (bytes === loading) bytes = null;
            });
            bytes = loading;
          }
          return bytes;
        },
      };
      programs.set(displayHash, program);
    }
    return program;
  };

  /**
   * The CSS for text drawn by `primary`: then the fallbacks, then the last
   * resort, then `tail`, the system's families for before they're mounted.
   */
  const cssOf = (
    primary: MountableFontProgram | null,
    style: { weight: number; italic: boolean },
    fallbacks: readonly string[],
    tail: string,
  ): FontCss => {
    const current = list.get();
    const named: MountableFontProgram[] = [];
    const add = (program: MountableFontProgram) => {
      if (!named.some((known) => known.hash === program.hash)) named.push(program);
    };
    if (primary) add(primary);
    for (const hash of fallbacks) add(programOf(hash, styleOfProgram(current, hash)));
    add(lastResortFontProgram());
    return {
      fontFamily: cssFamilyList(
        named.map((program) => program.family),
        tail,
      ),
      fontWeight: style.weight,
      fontStyle: style.italic ? 'italic' : 'normal',
      programs: named,
    };
  };

  const cached = (key: string, build: () => FontCss): FontCss => {
    let known = css.get(key);
    if (!known) {
      known = build();
      css.set(key, known);
    }
    return known;
  };

  /**
   * The system's families for a font: a standard font's look-alikes; for a
   * registered font, also the family an app mounts it under itself
   * (`mountWebFont` in `@embedpdf/web`, named by its key).
   */
  const tailOf = (font: Font | undefined, standard: StandardFont | null): string => {
    if (standard) return standardFontStack(standard);
    if (font?.source === 'engine') return `"epdf-${font.name}", sans-serif`;
    return 'sans-serif';
  };

  const standardCss = (font: StandardFont): FontCss =>
    cssOf(
      standardFontProgram(font),
      STANDARD_FACES[font],
      fallbackHashes(list.get()),
      tailOf(undefined, font),
    );

  /**
   * A listed font's CSS. A font whose program can't reach the browser (one
   * the document only names, a subset without a display file) is drawn in
   * the standard font the engine falls back to for its face.
   */
  const listedCss = (font: Font): FontCss => {
    const program = font.programs[0];
    if (!program?.displayHash || !program.canDownload) {
      return standardCss(
        standardFontForFace({ family: font.familyName, weight: font.weight, italic: font.italic }),
      );
    }
    return cssOf(
      programOf(program.displayHash, font),
      font,
      fallbackHashes(list.get()),
      tailOf(font, null),
    );
  };

  const api: FontsCapability = {
    getFontList: list.get,
    getStatus: list.getStatus,
    ensureLoaded: () => list.ensureLoaded(),
    refresh: () => list.refresh(),
    resolve: async (request, options) =>
      ctx.cancellable(options?.signal, documentFonts(ctx.doc).resolve(request)),
    getProgram: async (displayHash, options) => {
      let info = programInfos.get(displayHash);
      if (!info) {
        info = documentFonts(ctx.doc).getProgram(displayHash);
        programInfos.set(displayHash, info);
        info.catch(() => programInfos.delete(displayHash));
      }
      // Another caller may share the read: cancelling this one leaves it running.
      return ctx.cancellable(
        options?.signal,
        info.then((value) => value),
      );
    },
    getFontCss: (font) =>
      cached(`font:${font}`, () => {
        if (isStandardFontName(font)) return standardCss(font);
        const current = list.get();
        const listed = current ? fontNamed(current, font) : undefined;
        if (listed) return listedCss(listed);
        // Not listed (yet): the family an app mounts a registered font under itself.
        return cssOf(null, { weight: 400, italic: false }, [], `"epdf-${font}", sans-serif`);
      }),
    getFaceCss: (face) =>
      cached(`face:${face.family}|${face.weight ?? 400}|${face.italic ?? false}`, () => {
        const current = list.get();
        const listed = current ? fontForFace(current, face) : undefined;
        return listed ? listedCss(listed) : standardCss(standardFontForFace(face));
      }),
    getRunCss: (run) =>
      cached(
        `run:${run.font}|${run.weight}|${run.italic}|${run.program}|${run.fallbacks.join(',')}`,
        () => {
          const standard = isStandardFontName(run.font) ? run.font : null;
          const current = list.get();
          return cssOf(
            run.program ? programOf(run.program, run) : null,
            run,
            run.fallbacks,
            tailOf(current ? fontNamed(current, run.font) : undefined, standard),
          );
        },
      ),
    getFaceOfCssFamily: (cssFamily) => {
      const prefix = programPrefixOf(cssFamily);
      if (!prefix) return null;
      const standard = [...STANDARD_FONTS].find((font) =>
        standardFontProgram(font).hash.startsWith(prefix),
      );
      if (standard) return { ...STANDARD_FACES[standard] };
      const font = list
        .get()
        ?.fonts.find((candidate) =>
          candidate.programs.some((program) => program.displayHash?.startsWith(prefix)),
        );
      return font ? { family: font.familyName, weight: font.weight, italic: font.italic } : null;
    },
    onFontListChanged: listChanged.on,
  };

  return { api };
}
