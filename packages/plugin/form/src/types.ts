import type {
  AnnotationRef,
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
  FormEffectsResult,
  FormSnapshot,
  PdfActionTargetRef,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';
import type {
  ActionOrigin,
  ActionTriggerResult,
  PdfAnnotationEventKind,
} from '@embedpdf/plugin-actions';
import type {
  ScriptBudget,
  ScriptDiagnostic,
  ScriptExecutionError,
  ScriptIdentity,
  ScriptUiEffect,
} from '@embedpdf/core-acrojs';
import type { ScriptSandboxFactory } from '@embedpdf/core-js-sandbox';
import { createCapabilityToken } from '@embedpdf/core';

import type { FillItem } from './core/fill-items';
import type { Box, FieldKey, Model } from './core/model';

export interface FormState {
  model: Model;
}

export interface FormScriptingOptions {
  /** Explicit opt-in. PDF JavaScript remains inert when false/omitted. */
  enabled: boolean;
  /** Override the lazy QuickJS factory (tests or another isolated VM). */
  sandboxFactory?: ScriptSandboxFactory;
  /** Optional embedder identity fields layered over engine/JWT identity. */
  identity?: Partial<ScriptIdentity> | (() => Partial<ScriptIdentity>);
  /** Target document filename exposed as `this.documentFileName`. */
  fileName?: () => string;
  /** Injected deterministic transaction environment. */
  now?: () => number;
  utcOffsetMinutes?: () => number;
  randomSeed?: () => number;
  budget?: ScriptBudget;
  /** Framework/application port for app.alert, print, and page navigation. */
  onUiEffect?: (effect: ScriptUiEffect) => void;
  onDiagnostic?: (diagnostic: ScriptDiagnostic) => void;
  onError?: (error: ScriptExecutionError) => void;
}

export interface FormPluginOptions {
  scripting?: FormScriptingOptions;
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
 * `phase` says WHO asked: `'boot'` = a document-open script (Adobe's
 * version-check boilerplate lives here — embedders typically suppress these
 * nags), `'user'` = a script triggered by the user's own interaction (a
 * validation alert — show it).
 */
export type FormUiEffect = ScriptUiEffect & {
  /** WHO asked, script-model axis: `'boot'` = a name-tree/document-open boot
   *  script, `'user'` = a runtime script. */
  phase: 'boot' | 'user';
  /**
   * The dispatch-origin axis (present when the script ran inside an action
   * dispatch): a lifecycle `/OpenAction` script is NOT a name-tree boot
   * script — the two axes are deliberately separate. Providers use this for
   * the default visibility matrix (suppress lifecycle alerts, block
   * non-user print); embedder handlers receive it and may decide otherwise.
   */
  origin?: ActionOrigin;
};

/** Runtime adapter for alerts, print requests, and zero-based page navigation. */
export type FormUiEffectProvider = (effect: FormUiEffect) => void;

/** Input for {@link FormCapability.placeField}. */
export interface PlaceFieldInput {
  family: Exclude<FormFieldFamily, 'pushbutton' | 'signature' | 'unknown'>;
  pageObjectNumber: number;
  /** Content-space LOGICAL field box (no visual padding semantics). */
  box: Box;
  /** Widget styling in the engine vocabulary (`WidgetAppearance`). Convert a
   *  tool's flat CSS defaults with `widgetAppearanceFromProps` from
   *  `@embedpdf/plugin-annotation`. Omitted → the engine's bare defaults. */
  appearance?: WidgetAppearance;
}

/** What {@link FormCapability.placeField} created. */
export interface PlacedField {
  field: FormFieldDTO;
  /** The widget placed on the requested page (join key to the annotation
   *  plane for auto-selection), or null when the engine reported none. */
  widget: FormFieldDTO['widgets'][number] | null;
}

export type FormAction = { type: 'SET_MODEL'; model: Model };

/**
 * The form plugin's public capability: the FIELD plane. Widgets stay
 * annotations (geometry/appearance live there); this surface owns values,
 * interchange, and the fill-mode projection.
 */
export interface FormCapability {
  /** The current reconciled form state (null until the first load lands). */
  snapshot(): FormSnapshot | null;
  /** Re-read the form from the engine (imports/repair/remote bursts). */
  refresh(): Promise<void>;

  /** Fill controls for one page — content-space, framework-agnostic. */
  fillItems(pageObjectNumber: number): FillItem[];
  /**
   * The fill control for ONE widget, by annotation object number — the join
   * the annotation-plane render layer uses (its RenderItem carries the live
   * box, so this item's `box` is advisory). Reference-stable per model change.
   * Null until the snapshot lands, or for families with no fill control.
   */
  fillItem(annotObjectNumber: number): FillItem | null;
  /** Make sure a page's widget geometry is loaded (idempotent, lazy). */
  ensureGeom(pageObjectNumber: number): void;

  field(key: FieldKey): FormFieldDTO | null;
  fieldForWidget(annotObjectNumber: number): FormFieldDTO | null;

  /** Commit a text value (call on blur/Enter — keystrokes stay local). */
  setText(key: FieldKey, value: string): Promise<void>;
  /** Toggle a checkbox/radio widget by its on-state; null clears the group. */
  toggle(key: FieldKey, onState: string | null): Promise<void>;
  /** Select choice options by export value. */
  choose(key: FieldKey, values: string[]): Promise<void>;
  /** Commit one originating-client value transaction, including K/V/C/F scripts when enabled. */
  commitValue(ref: FormFieldRef, value: FormFieldValue): Promise<FormCommitResult>;
  /**
   * Execute one widget's `/A` activation. With the actions plugin installed
   * the FULL tree is delegated to its dispatcher (Hide/ResetForm buttons work
   * even with scripting off) — `kind: 'dispatched'`; without it, today's
   * scripting-transaction path runs — `kind: 'form'`.
   */
  activateWidget(key: FieldKey, annotationRef: AnnotationRef): Promise<WidgetActivationResult>;
  /**
   * Report one widget DOM event (pointer enter/leave, down/up, focus/blur).
   * With the actions plugin present the matching `/AA` tree dispatches
   * (hover rides the shared coalescing pump; `/A` shadows `/AA U` per ISO
   * Table 197); without it — or without a tree — this is a cheap no-op.
   * Fire-and-forget by design: results surface via the actions events.
   */
  notifyWidgetEvent(key: FieldKey, ref: AnnotationRef, event: PdfAnnotationEventKind): void;
  /** Install the framework/application adapter for script-produced UI requests. */
  setUiEffectProvider(provider: FormUiEffectProvider | null): void;
  /** Restore a field to its /DV default. */
  reset(key: FieldKey): Promise<void>;
  /** Raw engine passthrough for anything the sugar above doesn't cover. */
  setValue(ref: FormFieldRef, value: FormFieldValue): Promise<FormSetValueResult>;

  exportData(format?: FormDataFormat): Promise<FormDataExport>;
  importData(data: Uint8Array | ArrayBuffer, format?: FormDataFormat): Promise<FormImportResult>;
  repair(options?: FormRepairOptions): Promise<FormRepairResult>;

  // ── design mode (doc.forms.modify) ─────────────────────────────────────
  /**
   * Create a field of `family` with one styled widget at a content-space box
   * — the palette tools' commit, and the programmatic authoring entry (works
   * with NO annotation plugin: a pure `doc.forms` call). The box is clamped
   * to the page; sizing policy (click default vs drag rect) is the caller's.
   * The field gets a deterministic auto-name (`text_1`, …; rename in the
   * field panel). Resolves AFTER the annotation plane (when present) has
   * re-read the page, so the returned widget is immediately selectable.
   */
  placeField(input: PlaceFieldInput): Promise<PlacedField>;
  /** The page's content box (`{0,0,w,h}`) — page-bound placement math. */
  pageBox(pageObjectNumber: number): Box | null;
  /** Field-plane properties: name, required, options, default value. */
  updateField(key: FieldKey, patch: FormFieldPatch): Promise<void>;
  /** Delete the field and every widget of it (cascades on the page). */
  deleteField(key: FieldKey): Promise<void>;
  /** Unlink one widget: it stays as an inert annotation, the field survives. */
  detachWidget(key: FieldKey, annotObjectNumber: number): Promise<void>;

  /**
   * The twins (permissions.md): would the family's verbs succeed now for
   * this session? `canRead` — the form model hydrates at all (false = the
   * hydration gate left it empty by right); `canFill` — value writes
   * (`setText`/`toggle`/`choose`/`reset`; also fused into every
   * `FillItem.disabled`); `canDesign` — the field-design family
   * (`placeField`/`updateField`/`deleteField`/`detachWidget`).
   */
  canRead(): boolean;
  canFill(): boolean;
  canDesign(): boolean;
}

/** What one widget activation did — which world handled it (see
 *  {@link FormCapability.activateWidget}). Both framework call sites ignore
 *  the value today; chrome that cares can discriminate on `kind`. */
export type WidgetActivationResult =
  | { kind: 'form'; result: FormCommitResult }
  | { kind: 'dispatched'; result: ActionTriggerResult };

/**
 * INTERNAL host lens — plugin-to-plugin only (the actions plugin's interim
 * `javascript` / `reset-form` executors). Import the token from
 * `@embedpdf/plugin-form/internal`, never from application code. Phase 3's
 * shared ScriptHost replaces `runActivationScript`.
 */
export interface FormHostCapability extends FormCapability {
  /**
   * Run ONE activation script (a single JS node from a dispatched chain) as a
   * widget-activate transaction. Takes the SCRIPT, not the node — the
   * dispatcher owns the `/Next` walk, and the program builder recurses into
   * `next`, so passing a node through would re-execute descendants.
   * `scripted: false` in the result = the controller never ran (scripting
   * off, or no form fields to anchor the transaction on) — the caller maps
   * that to an inert node, not a failure.
   */
  runActivationScript(
    script: string,
    origin?: FormFieldRef,
    dispatchOrigin?: ActionOrigin,
  ): Promise<FormCommitResult>;
  /**
   * Execute one ResetForm action: resolve targets against the live snapshot
   * (`null` = every field; `exclude` = complement; a resolution yielding
   * zero refs never reaches the engine), reset as ONE engine batch, refresh,
   * then recalculate when scripting is enabled (Acrobat's behaviour).
   */
  resetFormAction(
    fields: PdfActionTargetRef[] | null,
    exclude: boolean,
  ): Promise<FormCommitResult>;
}

/**
 * The form capability token. Typed to the full {@link FormHostCapability}
 * here (the package internals + the `/internal` entry use this view). The
 * package root re-exports the SAME token narrowed to {@link FormCapability}.
 */
export const FormToken = createCapabilityToken<FormHostCapability>('form');

export type { FillItem } from './core/fill-items';
export type { Box, FieldKey } from './core/model';
