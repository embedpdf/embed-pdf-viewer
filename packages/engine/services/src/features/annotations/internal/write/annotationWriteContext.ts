import type {
  DescribeFont,
  FontIdentityInfo,
  FontRestriction,
  WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { DrawingIndex } from '../../../../document-session/DrawingIndex';

/**
 * Optional capabilities threaded into per-subtype annotation writers.
 *
 * The registered-font resolver serves the FreeText writer (stable
 * `registeredFontKey` → this thread's volatile `CFX_FontRegistry::FontId`).
 * The document/page pointers and `resources` serve the writers that take
 * bytes (stamp, file attachment): image objects and files are created
 * against the document from the resources that came with the write. Every
 * member is optional end-to-end — writers that don't need one ignore it.
 */
export interface AnnotationWriteContext {
  /**
   * Resolve a registered font key to this thread's native FontId. Throws if
   * the key was never registered on this thread. Absent when the host has no
   * font registry wired (e.g. read-only paths).
   */
  resolveRegisteredFontId?: (fontKey: string) => number;
  /**
   * The identity (family, weight, italic) a registered key resolved to, or
   * undefined for a string that is not a key. Rich text names faces by
   * identity, so a run's `family` may be a key, a standard name, or a
   * family; this is how a key is told apart.
   */
  describeRegisteredFont?: (fontKey: string) => FontIdentityInfo | undefined;
  /**
   * The face a box's font name stands for: a registered key's identity, or a
   * document font's family, weight and italic as the font list gives them;
   * undefined for any other name. Rich text names fonts by face, so this is
   * how a `fontFamily` (or a run's `family`) becomes one.
   */
  describeFont?: DescribeFont;
  /**
   * The document program a font name names, when new text can be written with
   * it: its stream's object number. A face can't tell two programs that
   * describe themselves alike apart; the program can.
   */
  documentProgramOf?: (name: string) => number | undefined;
  /**
   * The document program a `fontFamily` names, when it names one of the
   * document's fonts: its stream's object number, and whether new text may be
   * written with it (and why not). Undefined for any other name.
   */
  resolveDocumentFont?: (
    name: string,
  ) => { objectNumber: number; choosable: boolean; restrictions: FontRestriction[] } | undefined;
  /** The runtime, for writers that marshal tables of pointers (a widget's actions). */
  runtime?: PdfRuntimeModule;
  /** Document pointer — required by writers that create page objects. */
  docPtr?: Ptr;
  /** Page pointer of the annotation being written. */
  pagePtr?: Ptr;
  /** The bytes that came with this write, by role. */
  resources?: WireAnnotationResources;
  /** The document's stamp drawings, by content: where a stamp's drawing is found or added. */
  drawings?: DrawingIndex;
  /** The page count of PDF bytes, or `null` when they don't open: a stamp's drawing is one page. */
  pdfPageCount?: (bytes: ArrayBuffer) => number | null;
}
