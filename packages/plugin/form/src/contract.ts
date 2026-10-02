/**
 * @embedpdf/plugin-form/contract: the public form vocabulary. Fields are
 * addressed by `FormFieldRef` (`toFieldRef(name)` for a name you know),
 * widgets by their `AnnotationRef`; the scripting seams are the host lens
 * (`/contract/host`).
 */
import type {
  BatchResult,
  DeepPartial,
  EventHook,
  EventOrigin,
  OperationOptions,
  ResourceStatus,
  SettingsApi,
} from '@embedpdf/core';
import type { ScriptDiagnostic, ScriptExecutionError, ScriptUiEffect } from '@embedpdf/core-acrojs';
import type {
  AnnotationRef,
  FormDataExport,
  FormDataFormat,
  FormEffectsResult,
  FormFieldDraft,
  FormFieldDTO,
  FormFieldFamily,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormKind,
  FormRepairOptions,
  FormRepairResult,
  FormSnapshot,
  PageRef,
} from '@embedpdf/engine-core/runtime';
import type { ActionOrigin, ActionTriggerResult } from '@embedpdf/plugin-actions/contract';

import type { WidgetHit } from './model';
import type { FormWidgetItem } from './read/fill-items';

export { FormToken } from './token';
export { toFieldRef } from '@embedpdf/engine-core/runtime';
export type { FormWidgetItem, FormWidgetLook } from './read/fill-items';
export type { Box, WidgetHit } from './model';
export type {
  FormDataExport,
  FormDataFormat,
  FormFieldDraft,
  FormFieldDTO,
  FormFieldFamily,
  FormFieldPatch,
  FormFieldRef,
  FormFieldValue,
  FormImportResult,
  FormKind,
  FormRepairOptions,
  FormRepairResult,
  FormSnapshot,
} from '@embedpdf/engine-core/runtime';

// ── settings ──────────────────────────────────────────────────────────────

/**
 * The form plugin's settings. `formPlugin(config)` registers them over
 * {@link FORM_DEFAULTS}, and `updateSettings()` changes them for every
 * document while the app runs. The colors are what the viewer draws around
 * fields (a field's own colors are in the PDF); each can also come from CSS
 * (`--epdf-form-focus`, `--epdf-form-field-border`,
 * `--epdf-form-field-background`, `--epdf-form-field-color`), which wins.
 */
export interface FormSettings {
  /**
   * Run the form's own checks, the keystroke, validate, calculate and format
   * scripts, when a value is written (`'scripts'`, which needs JavaScript on
   * in `actionsPlugin({ javascript })`), or accept every value (`'none'`).
   */
  readonly validation: 'scripts' | 'none';
  readonly focus: {
    /** The ring around the field being filled in: a CSS color, or `null` for the viewer's accent. */
    readonly color: string | null;
  };
  readonly fields: {
    /** The edge of a field that has no border of its own: a CSS color, or `null` for the accent at 55%. */
    readonly border: string | null;
    /** Inside a field that has no background of its own, while it's being filled in. */
    readonly background: string;
    /** The text of a field that has no color of its own. */
    readonly color: string;
  };
}

/** What the form settings are when the app registers none. */
export const FORM_DEFAULTS: FormSettings = {
  validation: 'scripts',
  focus: { color: null },
  fields: { border: null, background: 'rgb(255 255 255 / 0.92)', color: '#1f2a44' },
};

/** What `formPlugin(config)` takes: any of the settings, merged over the defaults. */
export type FormConfig = DeepPartial<FormSettings>;

// ── what the verbs take and give ──────────────────────────────────────────

/** Which fields `list()` returns: all of them, or those that match every given part. */
export interface FormFilter {
  readonly family?: FormFieldFamily;
  /** Fields with a box on this page: its ref or its index. */
  readonly page?: PageRef | number;
  /** One full name, such as `'billing.name'`. */
  readonly name?: string;
}

/**
 * What a value write did: `'applied'`, `'unchanged'` (the field already held
 * it), or `'rejected'` when the form's own validation refused the value.
 */
export type FormSetValueStatus = 'applied' | 'unchanged' | 'rejected';

/** What `setValue()` resolves: the field as it is now, and what the write did. */
export interface FormSetValueResult {
  readonly field: FormFieldDTO;
  readonly status: FormSetValueStatus;
}

/**
 * A field's value as plain data, for your own backend: a text box's,
 * dropdown's or radio group's text (`null` when empty), a checkbox's
 * `true`/`false`, a list's selected values.
 */
export type FormPlainValue = string | boolean | readonly string[] | null;

/** What `validate()` returns: whether every required field has a value, and the ones that don't. */
export interface FormValidation {
  readonly valid: boolean;
  /** The required fields that are empty, in page order (page, then top to bottom, then left to right). */
  readonly missing: readonly FormFieldDTO[];
}

/** What `reset()` resolves: the fields it changed, as they are now. */
export interface FormResetResult {
  readonly fields: readonly FormFieldDTO[];
}

/** What `create()`, `update()` and `removeWidget()` resolve: the field as it is now. */
export interface FormFieldResult {
  readonly field: FormFieldDTO;
}

/** A widget, addressed by its annotation ref or its object number alone. */
export type WidgetAddress = AnnotationRef | { objectNumber: number };

/** What one widget activation did: the form's own scripts ran, or the widget's action did. */
export type WidgetActivationResult =
  | { kind: 'form'; result: FormCommitResult }
  | { kind: 'dispatched'; result: ActionTriggerResult };

/** How a write through the document's scripts ended. */
export type FormCommitStatus = 'applied' | 'unchanged' | 'rejected' | 'failed';

/** A write through the document's keystroke, validate, calculate and format scripts, and what they asked for. */
export interface FormCommitResult {
  status: FormCommitStatus;
  scripted: boolean;
  effectsResult: FormEffectsResult | null;
  uiEffects: FormUiEffect[];
  diagnostics: ScriptDiagnostic[];
  error?: ScriptExecutionError;
}

/**
 * One request a document script made of the UI, such as an alert. `phase`
 * says who asked: `'boot'`, a script that runs when the document opens (many
 * PDF producers add a version check here that apps usually hide), or
 * `'user'`, a script a person's own action ran (a validation alert: show it).
 */
export type FormUiEffect = ScriptUiEffect & {
  phase: 'boot' | 'user';
  /**
   * What started the action the script ran in, when it ran in one: a page's
   * or the document's open action is not an open script, so the two are told
   * apart here and in `phase`.
   */
  origin?: ActionOrigin;
};

// ── events ────────────────────────────────────────────────────────────────

/** A field's value changed, whoever changed it: you, the form's scripts, or another session. */
export interface FormValueChangedEvent {
  readonly field: FormFieldDTO;
  readonly origin: EventOrigin;
}
/** A field was added. */
export interface FormFieldCreatedEvent {
  readonly field: FormFieldDTO;
  readonly origin: EventOrigin;
}
/** A field's settings or boxes changed. */
export interface FormFieldUpdatedEvent {
  readonly field: FormFieldDTO;
  readonly origin: EventOrigin;
}
/** A field was removed, with every box it had. */
export interface FormFieldDeletedEvent {
  readonly ref: FormFieldRef;
  readonly origin: EventOrigin;
}
/** The form's own validation refused a value: the field kept the one it had. */
export interface FormValidationRejectedEvent {
  readonly field: FormFieldDTO;
  readonly issues: readonly ScriptDiagnostic[];
}
/** The whole form was read. */
export interface FormResyncedEvent {
  readonly snapshot: FormSnapshot;
}

// ── the capability ────────────────────────────────────────────────────────

/**
 * The form plugin's public capability: the document's fields, filling them
 * in, moving form data in and out, and building the form. Widgets stay
 * annotations; this owns the fields and their values. Its settings belong to
 * the plugin, not to a document: a change reaches every open document.
 */
export interface FormCapability extends SettingsApi<FormSettings> {
  // ── reading ──
  /** Everything at once, as the engine's `list()` returns it. The same object until something changes; `null` before the first read. */
  getSnapshot(): FormSnapshot | null;
  /** Whether the form is read. */
  getStatus(): ResourceStatus;
  /** What the document has: `'none'`, `'acroform'` or `'xfa'`. */
  getFormKind(): FormKind;
  /** Every field, or the fields that match `filter`. Without a filter, the same array while nothing changes. */
  list(filter?: FormFilter): readonly FormFieldDTO[];
  /** One field, or `null` when the form has no such field. */
  get(ref: FormFieldRef): FormFieldDTO | null;
  /** The field a widget belongs to, or `null`. */
  getFieldForWidget(widget: WidgetAddress): FormFieldDTO | null;
  /** One field's value in the shape `setValue()` takes, or `null` for a field without one. */
  getValue(ref: FormFieldRef): FormFieldValue | null;
  /**
   * Each widget on a page (its ref or its index), with its place, its look,
   * its control, its value and whether it can be filled: for drawing the
   * fields yourself. The same array while nothing changes; empty for a page
   * that isn't in the document.
   */
  listWidgets(page: PageRef | number): readonly FormWidgetItem[];
  /** The widget under a point on a page, with its field, or `null`. */
  getWidgetAt(page: PageRef | number, point: { x: number; y: number }): WidgetHit | null;
  /** The field of the selected widget while one widget is selected (in design mode), or `null`. */
  getSelectedField(): FormFieldDTO | null;
  /** Check the required fields: `missing` lists the empty ones in page order. */
  validate(): FormValidation;
  /** Every value, keyed by full name, as plain data. Fields without a value are left out. */
  exportValues(): Readonly<Record<string, FormPlainValue>>;

  // ── filling ──
  /**
   * Fill in a field with `{ value }`, `{ checked }` or `{ selectedValues }`,
   * running the form's checks and scripts when the `validation` setting says
   * so. Fires `onValueChanged`, or `onValidationRejected` when the form
   * refuses the value. Rejects `permission-denied` without `doc.forms.fill`,
   * `not-found`, `invalid-input` for a value the field can't take,
   * `operation-cancelled`.
   */
  setValue(
    ref: FormFieldRef,
    value: FormFieldValue,
    options?: OperationOptions,
  ): Promise<FormSetValueResult>;
  /**
   * Fill in several fields, in order; one that fails doesn't stop the rest.
   * Rejects `permission-denied` without `doc.forms.fill`.
   */
  setValues(
    entries: readonly { readonly ref: FormFieldRef; readonly value: FormFieldValue }[],
    options?: OperationOptions,
  ): Promise<BatchResult<FormFieldRef, FormFieldRef>>;
  /**
   * Fill in fields by full name from plain values (as `exportValues()` gives
   * them). A name the form doesn't have, or a value its field can't take, is
   * skipped; the rest still land. Rejects `permission-denied` without
   * `doc.forms.fill`.
   */
  importValues(
    values: Readonly<Record<string, FormPlainValue>>,
    options?: OperationOptions,
  ): Promise<BatchResult<FormFieldRef, string>>;
  /**
   * Put back each field's default, for the whole form or the fields you
   * pass, then run the form's calculations. Fires `onValueChanged` per
   * changed field. Rejects `permission-denied` without `doc.forms.fill`.
   */
  reset(refs?: readonly FormFieldRef[], options?: OperationOptions): Promise<FormResetResult>;
  /** Do what a click on a widget does, such as running a button's action. Rejects `not-found` for a widget of no field. */
  activateWidget(widget: AnnotationRef, options?: OperationOptions): Promise<WidgetActivationResult>;

  // ── form data ──
  /** The form data as XFDF, or FDF with `'fdf'`. Rejects `permission-denied` without `doc.forms.read`. */
  export(format?: FormDataFormat, options?: OperationOptions): Promise<FormDataExport>;
  /**
   * Fill in the fields from FDF or XFDF bytes, telling the format by itself;
   * an entry the form can't take is skipped. Rejects `permission-denied`
   * without `doc.forms.fill`.
   */
  import(data: Uint8Array | ArrayBuffer, options?: OperationOptions): Promise<FormImportResult>;
  /** Read the whole form again; fires `onResynced`. */
  refresh(options?: OperationOptions): Promise<void>;

  // ── building ──
  /**
   * Add a field with a widget for each place it shows, with every setting the
   * engine takes. Fires `onFieldCreated`. Rejects `permission-denied` without
   * `doc.forms.modify`, `invalid-input` (a name that's taken, a radio button
   * without its export value).
   */
  create(draft: FormFieldDraft, options?: OperationOptions): Promise<FormFieldResult>;
  /** Change a field's settings: pass only what changes. Fires `onFieldUpdated`. Rejects like `create()`. */
  update(
    ref: FormFieldRef,
    patch: FormFieldPatch,
    options?: OperationOptions,
  ): Promise<FormFieldResult>;
  /** Remove a field and every widget it has. Fires `onFieldDeleted`. Rejects `permission-denied` without `doc.forms.modify`, `not-found`. */
  delete(ref: FormFieldRef, options?: OperationOptions): Promise<void>;
  /**
   * Take one widget out of a field that shows in several places: it stays on
   * its page as an ordinary widget annotation. Fires `onFieldUpdated`.
   * Rejects `permission-denied` without `doc.forms.modify`.
   */
  removeWidget(
    ref: FormFieldRef,
    widget: AnnotationRef,
    options?: OperationOptions,
  ): Promise<FormFieldResult>;
  /**
   * Fix a form other PDF apps read differently, such as fields missing from
   * the form's list, and resolve what was fixed. Fires `onResynced`. Rejects
   * `permission-denied` without `doc.forms.modify`.
   */
  repair(options?: FormRepairOptions & OperationOptions): Promise<FormRepairResult>;

  // ── permissions ──
  /** Whether reading the form is allowed: `doc.forms.read`. */
  canRead(): boolean;
  /** Whether filling it in is allowed: `doc.forms.fill`. */
  canFill(): boolean;
  /** Whether adding, changing and removing fields is allowed: `doc.forms.modify`. */
  canDesign(): boolean;

  // ── events ──
  /** A field's value changed, whoever changed it. */
  readonly onValueChanged: EventHook<FormValueChangedEvent>;
  /** A field was added. */
  readonly onFieldCreated: EventHook<FormFieldCreatedEvent>;
  /** A field's settings or widgets changed. */
  readonly onFieldUpdated: EventHook<FormFieldUpdatedEvent>;
  /** A field was removed. */
  readonly onFieldDeleted: EventHook<FormFieldDeletedEvent>;
  /** The form's own validation refused a value. */
  readonly onValidationRejected: EventHook<FormValidationRejectedEvent>;
  /** The whole form was read, as when it opens, after `refresh()` or a repair. */
  readonly onResynced: EventHook<FormResyncedEvent>;
}
