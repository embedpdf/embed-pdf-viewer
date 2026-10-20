/**
 * The fonts a box's text is laid out and drawn with in a browser
 * (`PaintFonts`, `@embedpdf/core-text`), found the way the engine finds them:
 * the box's font, the fallbacks in the order the engine tries them for its
 * style (`resolve`), and the last resort, each program with the characters it
 * covers and its line metrics (`getProgram`), its widths measured by the host
 * once it's mounted (`ctx.measurer`).
 */
import type { HostTextMeasurer } from '@embedpdf/core';
import type { MountableFontProgram } from '@embedpdf/core-fonts';
import {
  coversGrapheme,
  defaultPaintFonts,
  graphemesOf,
  lastResortPaintFont,
  matchGrapheme,
  programPaintFont,
  standardPaintFont,
  type PaintFont,
  type PaintFonts,
} from '@embedpdf/core-text';
import {
  isStandardFontName,
  type FontName,
  type FontProgramInfo,
  type FontResolution,
  type FontResolveRequest,
  type StandardFont,
} from '@embedpdf/engine-core/runtime';

/** What finding a font's paint fonts reads. */
export interface PaintFontSources {
  /** The host's measurer; `null` on a host that gives none. */
  readonly measurer: HostTextMeasurer | null;
  /** Whether the document's engine finds fonts (`resolve`, `getProgram`). */
  readonly canFind: () => boolean;
  /** Load the document's font list, which {@link programOf} and {@link standardOf} read. */
  readonly loadList: () => Promise<void>;
  readonly resolve: (request: FontResolveRequest) => Promise<FontResolution>;
  readonly getProgram: (displayHash: string) => Promise<FontProgramInfo>;
  /** A program as a browser mounts it, in `style`, else in the style of the font it belongs to. */
  readonly programOf: (
    displayHash: string,
    style?: { weight: number; italic: boolean },
  ) => MountableFontProgram;
  /** The standard font a font whose program a browser can't get is drawn in. */
  readonly standardOf: (font: FontName) => StandardFont;
  /** Something {@link PaintFontsOf.get} answers from changed. */
  readonly changed: () => void;
}

export type PaintFontsOf = ReturnType<typeof createPaintFonts>;

/** A font's paint fonts (`null` until first found), and which of the document's fonts they're for. */
interface Found {
  value: PaintFonts | 'failed' | null;
  /** Counts the document's font changes; `-1` before the first find. */
  generation: number;
  finding: boolean;
}

/**
 * Each font's paint fonts, found the first time they're asked for, and found
 * again after the document's fonts change ({@link PaintFontsOf.reset}), the
 * ones found before kept until then.
 */
export function createPaintFonts(sources: PaintFontSources) {
  const { measurer } = sources;
  const defaults = new Map<FontName, PaintFonts>();
  const found = new Map<FontName, Found>();
  let generation = 0;

  const defaultsOf = (font: FontName): PaintFonts => {
    let fonts = defaults.get(font);
    if (!fonts) {
      fonts = defaultPaintFonts(font);
      defaults.set(font, fonts);
    }
    return fonts;
  };

  const programFont = async (
    measure: HostTextMeasurer,
    hash: string,
    style?: { weight: number; italic: boolean },
  ): Promise<PaintFont> => {
    const program = sources.programOf(hash, style);
    const info = await sources.getProgram(hash);
    return programPaintFont(info, program, (text, rtl) => measure.width(program, text, rtl));
  };

  /** The fonts a box in `font` draws with: its style's fallbacks, whatever its text. */
  const find = async (measure: HostTextMeasurer, font: FontName): Promise<PaintFonts> => {
    await sources.loadList();
    const resolution = await sources.resolve({ runs: [{ text: ' ', fontFamily: font }] });
    const run = resolution.runs[0]!;
    const fallbacks = Promise.all(run.fallbacks.map((hash) => programFont(measure, hash)));
    const face = isStandardFontName(run.font)
      ? standardPaintFont(run.font)
      : run.program
        ? await programFont(measure, run.program, run)
        : standardPaintFont(sources.standardOf(run.font));
    return { face, fallbacks: await fallbacks, lastResort: lastResortPaintFont() };
  };

  /** `font`'s paint fonts, found again unless they were found for the document's fonts now. */
  const foundFor = (measure: HostTextMeasurer, font: FontName): Found => {
    const entry = found.get(font) ?? { value: null, generation: -1, finding: false };
    found.set(font, entry);
    if (entry.finding || entry.generation === generation) return entry;
    entry.finding = true;
    const asked = generation;
    const settle = (value: PaintFonts | 'failed') => {
      entry.value = value;
      entry.generation = asked;
      entry.finding = false;
      sources.changed();
    };
    find(measure, font).then(settle, () => settle('failed'));
    return entry;
  };

  /** Whether a program `text` is drawn in is still loading (asking starts it loading). */
  const loading = (measure: HostTextMeasurer, fonts: PaintFonts, text: string): boolean => {
    const asked = new Set<PaintFont>();
    let waiting = false;
    for (const [begin, end] of graphemesOf(text)) {
      const { font, covered } = matchGrapheme(text.slice(begin, end), fonts);
      if (!covered || font.standard || asked.has(font)) continue;
      asked.add(font);
      if (!measure.ready(font.program)) waiting = true;
    }
    return waiting;
  };

  return {
    /**
     * The fonts a box in `font` draws `text` with; `null` while they're found
     * or a program the text needs loads (`changed` says when to ask again).
     * Text a standard font draws whole needs neither. Where the fonts can't be
     * found or measured, the box's standard font, or Helvetica, with only the
     * last resort behind it.
     */
    get(font: FontName, text: string): PaintFonts | null {
      const plain = defaultsOf(font);
      if (isStandardFontName(font) && coversGrapheme(plain.face, text)) return plain;
      if (!measurer || !sources.canFind()) return plain;
      const { value } = foundFor(measurer, font);
      if (value === null) return null;
      if (value === 'failed') return plain;
      return loading(measurer, value, text) ? null : value;
    },
    /** The document's fonts changed: find each font's again, the next time it's asked for. */
    reset(): void {
      generation++;
    },
  };
}
