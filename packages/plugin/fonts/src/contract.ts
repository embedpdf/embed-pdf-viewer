/**
 * The fonts plugin's public lens: the fonts a document can be written in, as
 * the engine lists them, and how a browser draws text in them so it shows the
 * program the engine writes with.
 */
import type { EventHook, OperationOptions, ResourceStatus } from '@embedpdf/core';
import type { MountableFontProgram } from '@embedpdf/core-fonts';
import type { PaintFonts } from '@embedpdf/core-text';
import type {
  FaceRequest,
  FontList,
  FontName,
  FontProgramInfo,
  FontResolution,
  FontResolveRequest,
  ResolvedFontRun,
} from '@embedpdf/engine-core/runtime';

export { FontsToken } from './token';
export type { MountableFontProgram } from '@embedpdf/core-fonts';
export type { PaintFonts } from '@embedpdf/core-text';

/**
 * How a browser draws text in a font: CSS whose families are the font
 * programs the engine draws with, and those programs. Mount `programs` where
 * the text is drawn (`createFontMounts` in `@embedpdf/web`), and draw with
 * `font-synthesis: none`, so the browser never fakes a bold or an italic the
 * engine won't draw.
 */
export interface FontCss {
  /**
   * The CSS `font-family` list: the program's family, the fallbacks' in the
   * engine's order, the last resort's (a box for a character no font has),
   * then the system's closest families, for the moment before the programs
   * are mounted.
   */
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic';
  /** The programs `fontFamily` names, in its order. */
  readonly programs: readonly MountableFontProgram[];
}

/** The document's font list was loaded, or changed. */
export interface FontListChangedEvent {
  readonly fonts: FontList;
}

/**
 * A document's fonts. The list is read the first time something asks for it
 * (`ensureLoaded()`, `fontsState`), and read again when the engine says it
 * changed: a write added a font, or the engine's own fonts changed.
 */
export interface FontsCapability {
  /** Every font that can be named in the document; `null` until the list is loaded. */
  getFontList(): FontList | null;
  /** Load state of the list. */
  getStatus(): ResourceStatus;
  /** Load the list unless it's loaded or loading. Rejects when the load fails. */
  ensureLoaded(): Promise<void>;
  /** Read the list from the engine again. Rejects as {@link ensureLoaded} does. */
  refresh(): Promise<void>;
  /**
   * The fonts a write would draw each run in, found the way the write finds
   * them, without writing: what an editor shows while someone types. Rejects
   * with `operation-cancelled` and `instance-closed`.
   */
  resolve(request: FontResolveRequest, options?: OperationOptions): Promise<FontResolution>;
  /**
   * A program the document's fonts name, by its display hash, with the
   * characters it covers and its line metrics. Kept per hash once read.
   * Rejects with `not-found` for a hash the list doesn't name,
   * `operation-cancelled` and `instance-closed`.
   */
  getProgram(displayHash: string, options?: OperationOptions): Promise<FontProgramInfo>;
  /**
   * How a browser draws text in the font a box names (its `fontFamily`). A
   * standard font needs no list; another font is drawn in the system's
   * closest look-alike until the list is loaded.
   */
  getFontCss(font: FontName): FontCss;
  /**
   * How a browser draws text in a face, as rich text names one: the font of
   * that family with the closest weight and italic, else the standard font
   * the engine falls back to.
   */
  getFaceCss(face: FaceRequest): FontCss;
  /** How a browser draws a run as {@link resolve} answered it. */
  getRunCss(run: ResolvedFontRun): FontCss;
  /**
   * The fonts a box in `font` draws `text` with, as the engine picks one per
   * character (the box's font, then the fallbacks in the order the engine
   * tries them for its style, then the last resort), each measured as the
   * browser shapes it (the kernel's `measurer`): what `@embedpdf/core-text`
   * lays the text out with, so a viewer draws what the engine will write.
   * `null` while they're found and the programs the text needs load: asking
   * starts that, and {@link getPaintFontsEpoch} moves when it's done. Text a
   * standard font draws whole needs neither. Where they can't be found or
   * measured (an engine that doesn't find a document's fonts, a host without
   * a measurer), the box's standard font, or Helvetica, with only the last
   * resort behind it.
   */
  getPaintFonts(font: FontName, text: string): PaintFonts | null;
  /** Moves each time {@link getPaintFonts} may answer differently: ask again when it does. */
  getPaintFontsEpoch(): number;
  /**
   * The face a CSS family this plugin names stands for (a program's family),
   * to read back text a browser drew itself; `null` for any other family and
   * for the last resort.
   */
  getFaceOfCssFamily(cssFamily: string): FaceRequest | null;
  /** The list was loaded, or changed. */
  readonly onFontListChanged: EventHook<FontListChangedEvent>;
}
