/**
 * @embedpdf/plugin-form/contract/host: the host lens, for the framework
 * layers and the actions plugin: loading a page's widgets, the widget event
 * feed, the text being typed, and the actions plugin's executors and sinks.
 * Same runtime token as the public one, typed wider.
 */
import { createHostToken } from '@embedpdf/core';
import type {
  AnnotationRef,
  FormEffect,
  FormEffectsResult,
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

import type { FormCapability, FormCommitResult, FormSetValueResult } from './contract';
import type { Box, ShownWidget } from './model';
import { FormToken as PublicFormToken } from './token';

export * from './contract';
export type { ShownWidget } from './model';

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
   * shows; hidden ones are left out. The form layer paints their pictures from it.
   */
  listShownWidgets(page: PageRef): readonly ShownWidget[];
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
  /** The fields a SubmitForm action sends, read from the engine when it runs. */
  resolveSubmitDataset(
    intent: SubmitIntent,
    actionContext: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest>;
  /** Write what a document script changed in the fields; never rejects, a refusal is reported per effect. */
  commitScriptFormEffects(effects: FormEffect[]): Promise<FormEffectsResult>;
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
