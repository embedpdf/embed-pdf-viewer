/**
 * @embedpdf/plugin-form/contract — the public form vocabulary. Fields are
 * addressed by `FormFieldRef` (`fieldRef.byName` / `fieldRef.byObjectNumber`),
 * widgets by their `AnnotationRef`; the render feed and the actions seams
 * are the host lens (`/contract/host`).
 */
import type {
  BatchResult,
  ChangeOrigin,
  EventHook,
  OperationOptions,
  ResourceStatus,
} from '@embedpdf/core';
import type { ScriptDiagnostic, ScriptExecutionError, ScriptUiEffect } from '@embedpdf/core-acrojs';
import type {
  AnnotationRef,
  FormDataExport,
  FormDataFormat,
  FormEffectsResult,
  FormFieldDTO,
  FormFieldFamily,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormRepairOptions,
  FormRepairResult,
  FormSetValueResult,
  FormSnapshot,
  PageRef,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';
import type { ActionOrigin, ActionTriggerResult } from '@embedpdf/plugin-actions/contract';

import type { Box, WidgetHit } from './model';
import type { FillItem } from './read/fill-items';
import type { AuthorableFormFamily } from './tools/definitions';

export { FormToken } from './token';
export type { FillItem } from './read/fill-items';
export type { Box, WidgetHit } from './model';
export type {
  FormDataExport,
  FormDataFormat,
  FormFieldDTO,
  FormFieldFamily,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormRepairOptions,
  FormRepairResult,
  FormSetValueResult,
  FormSnapshot,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';

/** `formPlugin(config)`. Whether document scripts run is set on `actionsPlugin({ javascript })`. */
export interface FormConfig {
  /**
   * Whether `setValue` runs the document's keystroke, validate, calculate and
   * format scripts (needs `actionsPlugin({ javascript })`). `'none'` writes
   * values straight to the engine. Default `'scripts'`.
   */
  validation?: 'scripts' | 'none';
}

export type FormCommitStatus = 'applied' | 'unchanged' | 'rejected' | 'failed';

export interface FormCommitResult {
  status: FormCommitStatus;
  scripted: boolean;
  effectsResult: FormEffectsResult | null;
  uiEffects: FormUiEffect[];
  diagnostics: ScriptDiagnostic[];
  error?: ScriptExecutionError;
}

/**
 * One DOM-free UI request produced by the curated Acrobat scripting surface.
 * `phase` says who asked: `'boot'` = a document-open script (Adobe's
 * version-check boilerplate lives here — embedders typically suppress these
 * nags), `'user'` = a script triggered by the user's own interaction (a
 * validation alert — show it).
 */
export type FormUiEffect = ScriptUiEffect & {
  /** Who asked, script-model axis: `'boot'` = a name-tree/document-open boot
   *  script, `'user'` = a runtime script. */
  phase: 'boot' | 'user';
  /**
   * The dispatch-origin axis (present when the script ran inside an action
   * dispatch): a lifecycle `/OpenAction` script is not a name-tree boot
   * script — the two axes are deliberately separate. Providers use this for
   * the default visibility matrix (suppress lifecycle alerts, block
   * non-user print); embedder handlers receive it and may decide otherwise.
   */
  origin?: ActionOrigin;
};

/** Input for {@link FormCapability.placeField}. */
export interface CreateFieldInput {
  family: AuthorableFormFamily;
  page: PageRef;
  /** The widget's page-space box. */
  bounds: Box;
  /** A fully qualified name; auto-numbered from the family when omitted. */
  name?: string;
  appearance?: WidgetAppearance;
  /** Choice fields: the options to start with. */
  options?: readonly { label: string; value: string }[];
}

/** What {@link FormCapability.placeField} created. */
export interface CreatedField {
  field: FormFieldDTO;
  /** The widget on the requested page. */
  widget: FormFieldDTO['widgets'][number] | null;
}

/**
 * The form plugin's public capability: the field plane. Widgets stay
 * annotations (geometry/appearance live there); this surface owns values,
 * interchange, and the fill-mode projection.
 */
/** The outcome of a value write through the validated path. */
export type SetValueResult = FormCommitResult;

/** A widget as a fill surface paints it: page-space box, field, control, value. */
export type FormWidgetItem = FillItem;

/** A widget address for lookups: its annotation ref, or its object number alone. */
export type WidgetAddress = AnnotationRef | { annotObjectNumber: number };

export interface FormFilter {
  readonly family?: FormFieldFamily;
  /** Fields with a widget on this page. */
  readonly page?: PageRef;
  /** Exact fully qualified name. */
  readonly name?: string;
}

// ── events ──
export interface FormValueChangedEvent {
  readonly ref: FormFieldRef;
  readonly field: FormFieldDTO;
  readonly origin: ChangeOrigin;
}
export interface FormFieldChangedEvent {
  readonly ref: FormFieldRef;
  /** The field after the change; null once deleted. */
  readonly field: FormFieldDTO | null;
  readonly origin: ChangeOrigin;
}
export interface FormValidationRejectedEvent {
  readonly ref: FormFieldRef;
  readonly issues: readonly ScriptDiagnostic[];
}
export interface FormResyncedEvent {
  readonly snapshot: FormSnapshot;
}

/** Build a `FormFieldRef` without spelling the discriminator. */
export const fieldRef = {
  byName: (name: string): FormFieldRef => ({ kind: 'fqn', name }),
  byObjectNumber: (fieldObjectNumber: number): FormFieldRef => ({
    kind: 'objectNumber',
    fieldObjectNumber,
  }),
};

export interface FormCapability {
  // ── reading ──
  /** The reconciled field tree. Reference-stable until it changes. */
  getSnapshot(): FormSnapshot | null;
  getStatus(): ResourceStatus;
  listFields(filter?: FormFilter): readonly FormFieldDTO[];
  getField(ref: FormFieldRef): FormFieldDTO | null;
  /** The field a widget belongs to. */
  getFieldForWidget(widget: WidgetAddress): FormFieldDTO | null;
  /** The current value in the write vocabulary, or null for a valueless / unsupported entry. */
  getValue(ref: FormFieldRef): FormFieldValue | null;
  /** Widgets on a page with their page-space boxes, values and fill state. Reference-stable. */
  listWidgets(page: PageRef): readonly FormWidgetItem[];
  /** The widget under a page point. */
  getWidgetAt(page: PageRef, point: { x: number; y: number }): WidgetHit | null;

  // ── filling ──
  /**
   * Commit a value through the validated path (keystroke / validate /
   * calculate / format scripts when enabled). Rejects `permission-denied`
   * without `doc.forms.fill`.
   */
  setValue(
    ref: FormFieldRef,
    value: FormFieldValue,
    options?: OperationOptions,
  ): Promise<SetValueResult>;
  /** Engine passthrough — no scripts. */
  setValueRaw(
    ref: FormFieldRef,
    value: FormFieldValue,
    options?: OperationOptions,
  ): Promise<FormSetValueResult>;
  /** Several values, queued in order; best-effort per field. */
  setValues(
    entries: readonly { ref: FormFieldRef; value: FormFieldValue }[],
    options?: OperationOptions,
  ): Promise<BatchResult<FormFieldRef, FormFieldRef>>;
  setText(ref: FormFieldRef, text: string, options?: OperationOptions): Promise<SetValueResult>;
  /** Check (`onState`) or clear (`null`) a checkbox or radio group. */
  setChecked(
    ref: FormFieldRef,
    onState: string | null,
    options?: OperationOptions,
  ): Promise<SetValueResult>;
  setChoice(
    ref: FormFieldRef,
    values: readonly string[],
    options?: OperationOptions,
  ): Promise<SetValueResult>;
  /** Restore one field's default value. */
  reset(ref: FormFieldRef, options?: OperationOptions): Promise<void>;
  /** Reset the form, a set of fields, or everything but a set of fields. */
  resetAll(
    options?: { fields?: readonly FormFieldRef[]; exclude?: boolean } & OperationOptions,
  ): Promise<BatchResult<FormFieldRef, FormFieldRef>>;
  /** Run a widget's `/A` action as a click would. */
  activateWidget(
    widget: AnnotationRef,
    options?: OperationOptions,
  ): Promise<WidgetActivationResult>;

  // ── interchange ──
  exportData(format?: FormDataFormat, options?: OperationOptions): Promise<FormDataExport>;
  importData(
    data: Uint8Array | ArrayBuffer,
    format?: FormDataFormat,
    options?: OperationOptions,
  ): Promise<FormImportResult>;
  /** Values keyed by fully qualified name (valueless and unsupported entries omitted). */
  exportValues(): Readonly<Record<string, FormFieldValue>>;
  /** Set values from a plain object keyed by fully qualified name. */
  importValues(
    values: Readonly<Record<string, FormFieldValue>>,
    options?: OperationOptions,
  ): Promise<BatchResult<FormFieldRef, string>>;
  repair(options?: FormRepairOptions & OperationOptions): Promise<FormRepairResult>;
  /** Re-read the field tree from the engine. */
  refresh(options?: OperationOptions): Promise<void>;

  // ── designing ──
  /** A field with one widget. */
  createField(input: CreateFieldInput, options?: OperationOptions): Promise<CreatedField>;
  updateField(ref: FormFieldRef, patch: FormFieldPatch, options?: OperationOptions): Promise<void>;
  /** The field and its widgets. */
  deleteField(ref: FormFieldRef, options?: OperationOptions): Promise<void>;
  /** Link an inert widget annotation to a field. */
  attachWidget(ref: FormFieldRef, widget: AnnotationRef, options?: OperationOptions): Promise<void>;
  detachWidget(ref: FormFieldRef, widget: AnnotationRef, options?: OperationOptions): Promise<void>;

  // ── twins ──
  canRead(): boolean;
  canFill(): boolean;
  canDesign(): boolean;

  // ── events ──
  /** A confirmed value change — programmatic, script and remote writes alike. */
  readonly onValueChanged: EventHook<FormValueChangedEvent>;
  readonly onFieldCreated: EventHook<FormFieldChangedEvent>;
  readonly onFieldUpdated: EventHook<FormFieldChangedEvent>;
  readonly onFieldDeleted: EventHook<FormFieldChangedEvent>;
  /** A validated write was refused by the document's scripts. */
  readonly onValidationRejected: EventHook<FormValidationRejectedEvent>;
  /** The snapshot was replaced wholesale (a refresh landed). */
  readonly onResynced: EventHook<FormResyncedEvent>;
}

/** What one widget activation did — which world handled it (see
 *  {@link FormCapability.activateWidget}). Both framework call sites ignore
 *  the value today; chrome that cares can discriminate on `kind`. */
export type WidgetActivationResult =
  | { kind: 'form'; result: FormCommitResult }
  | { kind: 'dispatched'; result: ActionTriggerResult };
