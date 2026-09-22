/**
 * @embedpdf/plugin-form/contract/host — the HOST lens: the fill render feed,
 * geometry warming, the widget event feed and the actions-plane seams. Same
 * runtime token as the public one, typed wider.
 */
import type { CapabilityToken } from '@embedpdf/core';
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

import type { FormCapability, FormCommitResult } from './contract';
import type { FillItem } from './core/fill-items';
import type { Box } from './core/model';
import { FormToken as PublicFormToken } from './token';

export * from './contract';
export type { FormAction, FormState } from './model';

/**
 * HOST lens — plugin-to-plugin only (the actions plugin's interim
 * `javascript` / `reset-form` executors). Import the token from
 * `@embedpdf/plugin-form/contract/host`, never from application code.
 */
export interface FormHostCapability extends FormCapability {
  /** The render feed: widgets on a page with their page-space boxes. Reference-stable. */
  listFillItems(page: PageRef): FillItem[];
  getFillItem(annotObjectNumber: number): FillItem | null;
  /** Warm a page's widget geometry (one annotations read per page). */
  ensureLoaded(page: PageRef): void;
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
    ctx: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest>;
  commitScriptFormEffects(effects: FormEffect[]): Promise<FormEffectsResult>;
}

export const FormToken = PublicFormToken as unknown as CapabilityToken<FormHostCapability>;
