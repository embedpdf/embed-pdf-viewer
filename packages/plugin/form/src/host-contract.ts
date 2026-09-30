/**
 * @embedpdf/plugin-form/contract/host — the host lens: the fill render feed,
 * geometry warming, the widget event feed and the actions-plane seams. Same
 * runtime token as the public one, typed wider.
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

import type { FormCapability, FormCommitResult, SetValueResult } from './contract';
import type { Box } from './model';
import type { FillItem } from './read/fill-items';
import { FormToken as PublicFormToken } from './token';

export * from './contract';

/**
 * The host lens: members for sibling plugins and framework adapters (the fill
 * feed, the widget event feed, and the actions plugin's executors and sinks).
 * Application code uses the public capability.
 */
export interface FormHostCapability extends FormCapability {
  /** The render feed: widgets on a page with their page-space boxes. Reference-stable. */
  listFillItems(page: PageRef): FillItem[];
  getFillItem(annotObjectNumber: number): FillItem | null;
  /** Load a page's widget geometry (one annotation read per page). */
  ensureLoaded(page: PageRef): Promise<void>;
  /** The page box in page space (for placement clamping). */
  getPageBox(page: PageRef): Box | null;
  /** The widget DOM-event feed into the actions plane. */
  notifyWidgetEvent(
    field: FormFieldRef,
    widget: AnnotationRef,
    event: PdfAnnotationEventKind,
  ): void;
  resetFormAction(
    fields: PdfActionTargetRef[] | null,
    exclude: boolean,
    origin?: ActionOrigin,
  ): Promise<FormCommitResult>;
  resolveSubmitDataset(
    intent: SubmitIntent,
    actionContext: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest>;
  commitScriptFormEffects(effects: FormEffect[]): Promise<FormEffectsResult>;
  /**
   * The text someone is typing in a field, before it's written (write/typing.ts): a keystroke
   * calls `draftText`, blur or Enter `commitDraftText` (the field's scripts run then), Escape
   * `discardDraftText`. A download writes a draft first, like Acrobat commits the field being
   * edited before it saves. `commitDraftText` resolves `null` when there's nothing to write.
   */
  draftText(field: FormFieldRef, text: string): void;
  commitDraftText(field: FormFieldRef): Promise<SetValueResult | null>;
  discardDraftText(field: FormFieldRef): void;
}

export const FormToken = createHostToken<FormHostCapability>(PublicFormToken);
