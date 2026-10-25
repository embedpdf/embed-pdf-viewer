/**
 * @embedpdf/plugin-form/contract/host: the host lens, for the framework
 * layers and the actions plugin: loading a page's widgets, the widget event
 * feed, the text being typed, and the actions plugin's executors and sinks.
 * Same runtime token as the public one, typed wider.
 */
import { createHostToken } from '@embedpdf/core';
import type { TextEditorLayout } from '@embedpdf/core-form';
import type {
  AnnotationRef,
  FormEffect,
  FormFieldRef,
  PageRef,
  PdfActionTargetRef,
} from '@embedpdf/engine-core/runtime';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionOrigin,
  ActionSubmitRequest,
  PdfAnnotationEventKind,
  SubmitIntent,
} from '@embedpdf/plugin-actions/contract';
import type { FormCommitSinkResult } from '@embedpdf/plugin-actions/contract/host';
import type { FontCss } from '@embedpdf/plugin-fonts/contract';
import type { AppearancePicture } from '@embedpdf/plugin-render/contract/host';

import type { FormCapability, FormCommitResult, FormSetValueResult } from './contract';
import type { Box, ShownWidget } from './model';
import type { WidgetPainting } from './services/looks';
import { FormToken as PublicFormToken } from './token';

export * from './contract';
export type { ShownWidget } from './model';
export type { WidgetPainting } from './services/looks';
export type { TextEditorLayout } from '@embedpdf/core-form';

/**
 * The host lens: members for the framework layers and sibling plugins (the
 * widget event feed, the text being typed, and the actions plugin's
 * executors and sinks). Application code uses the public capability.
 */
export interface FormHostCapability extends FormCapability {
  /** Load a page's widgets (one annotation read per page), so `listWidgets(page)` has them. */
  ensureLoaded(page: PageRef): Promise<void>;
  /**
   * The widgets a page shows, in the order the page draws them, each with the appearance state it
   * shows and whether its look is `pending` (the view's isn't the confirmed one yet); hidden ones
   * are left out. The form layer paints their pictures from it, and the painter's drawing
   * (`getWidgetPainting`) for a pending one or one whose picture is older than its look. In design
   * mode, while the widgets are lent to the annotation plugin, none: the annotation layer draws
   * them.
   */
  listShownWidgets(page: PageRef): readonly ShownWidget[];
  /**
   * What a page's widget pictures depend on: its widgets at their picture
   * versions (`5@2|6@7`). Load the pictures again when it changes, or when
   * the appearance scale does. A checkbox that only switches its state
   * doesn't move it.
   */
  getAppearanceEpoch(page: PageRef): string;
  /**
   * Every picture of a page's widgets, at rest, in every state, each with the
   * picture version of its widget (`ShownWidget.pictureVersion`), through the
   * render plugin; none without it. The form layer and design mode share them.
   */
  renderAppearances(
    page: PageRef,
    scale: number,
    signal?: AbortSignal,
  ): Promise<readonly AppearancePicture[]>;
  /**
   * What the widget looks like as the view has it, drawn by the painter (`@embedpdf/core-form`): its
   * scene in page space, its text in the engine's own faces (each glyphs node carries the program
   * to mount). The same object while nothing it shows changes; `null` for a widget the painter
   * doesn't draw (a signature).
   */
  getWidgetPainting(widget: AnnotationRef): WidgetPainting | null;
  /**
   * Where a text field's editor shows `text` (what is typed in it), so it sits where the engine
   * will draw it: the face, the size the engine draws at (a fitted size resolved for `text`),
   * the text's box inside the widget's, one line's height and a comb's spacing, in page points.
   * `null` for a widget that isn't a text field's.
   */
  getTextEditorLayout(widget: AnnotationRef, text: string): TextEditorLayout | null;
  /**
   * How a control the painter doesn't draw (a list box's rows) draws the widget's text: its font
   * as CSS, as the engine picks it (the fonts plugin's; without it, the standard font the engine
   * falls back to), with the programs the family list names, to mount. `null` for a widget that
   * isn't there.
   */
  getWidgetFontCss(widget: AnnotationRef): FontCss | null;
  /** The page box in page space, for keeping a placement on the page; `null` for a page that isn't there. */
  getPageBox(page: PageRef): Box | null;
  /** Send a widget's pointer or focus event to the actions plugin, which runs its `/AA` actions. */
  notifyWidgetEvent(
    field: FormFieldRef,
    widget: AnnotationRef,
    event: PdfAnnotationEventKind,
  ): void;
  /** Run a ResetForm action: reset the fields it names (or all but them), then recalculate. */
  resetFormAction(
    fields: PdfActionTargetRef[] | null,
    exclude: boolean,
    origin?: ActionOrigin,
  ): Promise<FormCommitResult>;
  /** The fields a SubmitForm action sends: the form as the user sees it, once every fill on its way is answered. */
  resolveSubmitDataset(
    intent: SubmitIntent,
    actionContext: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest>;
  /**
   * Write what a document script changed in the fields, with the calculations a value causes,
   * as one change: shown at once, sent once the script's transaction ends. Never rejects; a
   * change it can't stage reports why, and the engine's refusal comes through the change queue.
   */
  commitScriptFormEffects(effects: FormEffect[]): Promise<FormCommitSinkResult>;
  /**
   * The text someone is typing in a field, before it's written (write/typing.ts): a keystroke
   * calls `draftText`, blur or Enter `commitDraftText` (the field's scripts run then), Escape
   * `discardDraftText`. A download writes a draft first, like Acrobat commits the field being
   * edited before it saves. `commitDraftText` resolves `null` when there's nothing to write.
   */
  draftText(field: FormFieldRef, text: string): void;
  commitDraftText(field: FormFieldRef): Promise<FormSetValueResult | null>;
  discardDraftText(field: FormFieldRef): void;
}

export const FormToken = createHostToken<FormHostCapability>(PublicFormToken);
