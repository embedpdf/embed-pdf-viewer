import type {
  AnnotationRef,
  FormEffect,
  FormFieldDisplay,
  FormFieldFamily,
  FormFieldRef,
} from '@embedpdf/engine-core/runtime';

/** JSON-safe value vocabulary exposed through Acrobat's `event` and `Field`. */
export type ScriptValue = string | number | boolean | null | string[];

export interface ScriptFieldOption {
  label: string;
  value: string;
}

/** Detached field state supplied to one script transaction. */
export interface ScriptFieldInput {
  ref: FormFieldRef;
  name: string;
  family: FormFieldFamily;
  value: ScriptValue;
  defaultValue: ScriptValue;
  display: FormFieldDisplay;
  readOnly: boolean;
  required: boolean;
  options?: ScriptFieldOption[];
}

export interface ScriptIdentity {
  /** Acrobat `identity.name`. Empty when the embedder did not configure it. */
  name: string;
  loginName: string;
  corporation: string;
  email: string;
}

export interface ScriptDocumentInput {
  id: string;
  fileName: string;
  pageCount: number;
  /** Zero-based current page, matching Acrobat `this.pageNum`. */
  pageNumber: number;
}

/** Required deterministic environment. `utcOffsetMinutes` is local minus UTC. */
export interface ScriptEnvironment {
  nowMs: number;
  utcOffsetMinutes: number;
  randomSeed: number;
}

export type ScriptEventKind =
  | 'name-tree-boot'
  | 'widget-activate'
  | 'field-keystroke'
  | 'field-validate'
  | 'field-calculate'
  | 'field-format';

export interface ScriptEventInput {
  kind: ScriptEventKind;
  /**
   * Explicit Acrobat `event.type` / `event.name` overrides for action-driven
   * runs (built from the dispatcher's trigger provenance — `Field` × `Mouse
   * Enter`, `Page` × `Open`, …; the `Annot` type is an EmbedPDF EXTENSION,
   * Acrobat has no event type for plain-annotation events). When omitted the
   * prelude derives them from `kind` (the K/V/C/F pipeline path).
   */
  type?: string;
  name?: string;
  target?: FormFieldRef;
  source?: FormFieldRef;
  value?: ScriptValue;
  change?: string;
  selStart?: number;
  selEnd?: number;
  willCommit?: boolean;
  modifier?: boolean;
  shift?: boolean;
}

/**
 * An Acrobat color: `['T']` transparent, `['G', g]`, `['RGB', r, g, b]`,
 * `['CMYK', c, m, y, k]` — components 0..1. The wire format scripts read and
 * write; conversion to renderer/engine colors happens host-side (color.ts).
 */
export type ScriptColorArray =
  | ['T']
  | ['G', number]
  | ['RGB', number, number, number]
  | ['CMYK', number, number, number, number];

/**
 * One script-addressable annotation in the prefetched world — every subtype
 * EXCEPT link and widget (Acrobat serves those through `Link`/`Field`
 * objects; here they are separate event planes). Curated read surface only —
 * never a raw dictionary.
 */
export interface ScriptAnnotInput {
  ref: AnnotationRef;
  /** `/NM` — the `getAnnot(nPage, name)` key. Empty when the PDF has none. */
  name: string;
  /** The engine subtype (e.g. `'square'`). */
  subtype: string;
  /** Zero-based page index (Acrobat's `page`). */
  page: number;
  /** PDF-space `[llx, lly, urx, ury]`. */
  rect: [number, number, number, number];
  contents: string;
  /** `/T` author and `/Subj` — read-only in v1 (collab identity stamping). */
  author: string;
  subject: string;
  strokeColor: ScriptColorArray;
  fillColor: ScriptColorArray;
  opacity: number;
  /** `/BS /W` border width in points. */
  width: number;
  /** Border style: `'S'` solid or `'D'` dashed. */
  borderStyle: 'S' | 'D';
  dash: number[];
  hidden: boolean;
  print: boolean;
  readOnly: boolean;
  locked: boolean;
  noView: boolean;
  toggleNoView: boolean;
  /** True for kinds whose appearance cannot be re-derived from properties
   *  (stamps, images): appearance writes are refused with a diagnostic. */
  opaqueBody: boolean;
}

/** The curated WRITE patch one script staged for one annotation — a
 *  canonical per-annot diff (last-write-wins per key, derived at run end
 *  exactly like form effects). Visibility keys ride `flags` so the commit
 *  sink maps them onto ONE engine flags patch. */
export interface ScriptAnnotEffect {
  ref: AnnotationRef;
  patch: {
    strokeColor?: ScriptColorArray;
    fillColor?: ScriptColorArray;
    opacity?: number;
    width?: number;
    borderStyle?: 'S' | 'D';
    dash?: number[];
    rect?: [number, number, number, number];
    contents?: string;
    flags?: Partial<{
      hidden: boolean;
      print: boolean;
      readOnly: boolean;
      locked: boolean;
      noView: boolean;
      toggleNoView: boolean;
    }>;
  };
}

/**
 * The writable-property validity matrix, keyed by engine subtype — the ONE
 * exported table (the prelude inlines an identical copy; a parity test pins
 * them together, and plugin-annotation drift-guards this against the kind
 * registry's PropSpecs). Flags + contents are writable everywhere
 * script-addressable; appearance keys vary by kind.
 */
export const ANNOT_WRITABLE_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  square: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
  circle: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
  polygon: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
  polyline: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
  line: ['strokeColor', 'fillColor', 'opacity', 'width', 'borderStyle', 'dash', 'rect'],
  ink: ['strokeColor', 'opacity', 'width', 'rect'],
  'free-text': ['strokeColor', 'fillColor', 'opacity', 'rect'],
  highlight: ['strokeColor', 'opacity'],
  underline: ['strokeColor', 'opacity'],
  squiggly: ['strokeColor', 'opacity'],
  strikeout: ['strokeColor', 'opacity'],
  caret: ['strokeColor', 'opacity'],
  text: ['strokeColor', 'opacity', 'rect'],
  stamp: ['rect'],
  'file-attachment': ['strokeColor', 'opacity'],
});

/** Complete input for one deterministic run. No ambient host values are read. */
export interface ScriptInput {
  document: ScriptDocumentInput;
  identity: ScriptIdentity;
  environment: ScriptEnvironment;
  fields: ScriptFieldInput[];
  /** The prefetched annots plane (page-scoped — see the D6 deviation). */
  annots?: ScriptAnnotInput[];
  /** Zero-based page indexes the plane covers. */
  annotPages?: number[];
  /** True when annotPages spans the whole document (no scope diagnostic). */
  annotsCoverDocument?: boolean;
  event: ScriptEventInput;
}

export type ScriptUiEffect =
  | { kind: 'alert'; message: string; icon: number; title?: string }
  | { kind: 'print' }
  | { kind: 'gotoPage'; page: number }
  /** `doc.submitForm(...)` — a submit INTENT, resolved and sink-routed
   *  outside the VM (never a network call from here). `fieldNames` are
   *  include-mode (Acrobat's aFields); `null` = the whole eligible form. */
  | {
      kind: 'submitForm';
      url: string | null;
      fieldNames: string[] | null;
      includeEmpty: boolean;
      format?: 'fdf' | 'html' | 'xfdf' | 'pdf';
      method?: 'post' | 'get';
    };

export type ScriptDiagnosticCode =
  | 'blocked-network'
  | 'unsupported-api'
  | 'invalid-field-value'
  // A script failed and was degraded to a warning. Boot errors must never
  // disable interactive filling, and a K/V/C/F exception must never destroy
  // the user's input (only an explicit `event.rc = false` rejects).
  | 'script-error'
  // A script-produced UI effect was withheld by permission (e.g. a print
  // request without `doc.print` authority) — observable, never silent.
  | 'ui-effect-suppressed';

export interface ScriptDiagnostic {
  code: ScriptDiagnosticCode;
  message: string;
}

// ── the sandbox contract (owned HERE; implementations re-export) ──────────
// core-js-sandbox depends on this package, so the structural interface must
// live on this side of the edge — the reverse import would be a cycle.

/** One isolated, stateful Acrobat-JavaScript realm for one PDF document. */
export interface ScriptSandbox {
  /** True after explicit disposal or a resource/runtime fault. */
  readonly disposed: boolean;
  /** Evaluate document name-tree sources once. Top-level effects are returned
   *  so the orchestrator can include them in the first transaction. */
  boot(sources: string[], input: ScriptInput, budget?: ScriptBudget): ScriptOutput;
  /** Run one event program against the realm's persistent globals. */
  run(source: string, input: ScriptInput, budget?: ScriptBudget): ScriptOutput;
  /** Release the realm. Idempotent. */
  dispose(): void;
}

export type ScriptSandboxFactory = () => Promise<ScriptSandbox>;

export interface ScriptExecutionError {
  kind: 'exception' | 'budget' | 'invalid-output';
  message: string;
  stack?: string;
}

export interface ScriptEventOutput {
  rc: boolean;
  value: ScriptValue;
  change: string;
  selStart: number;
  selEnd: number;
}

/**
 * Effects are committed only by the originating client's orchestrator, in
 * the DECLARED cross-plane order: `formEffects` first (field order — matching
 * the derive-by-diff model), then `annotEffects` (annot order); the first
 * failing effect marks every later effect in BOTH streams skipped.
 */
export interface ScriptOutput {
  event: ScriptEventOutput;
  formEffects: FormEffect[];
  annotEffects: ScriptAnnotEffect[];
  uiEffects: ScriptUiEffect[];
  diagnostics: ScriptDiagnostic[];
  error?: ScriptExecutionError;
}

export interface ScriptBudget {
  maxExecutionMs: number;
  maxMemoryBytes: number;
  maxStackBytes: number;
  maxEffects: number;
  maxOutputBytes: number;
}

export const DEFAULT_SCRIPT_BUDGET: Readonly<ScriptBudget> = Object.freeze({
  maxExecutionMs: 50,
  maxMemoryBytes: 16 * 1024 * 1024,
  maxStackBytes: 512 * 1024,
  maxEffects: 256,
  maxOutputBytes: 1024 * 1024,
});

/**
 * The shipped security posture (updated per phase — the live authority for
 * per-type × origin decisions is the actions plugin's policy; these
 * constants DOCUMENT the posture, they do not enforce it). The only
 * configurable switch is explicit opt-in.
 */
export interface ScriptSecurityPolicy {
  enabled: boolean;
  executionOwner: 'originating-client-only';
  nameTreeBoot: 'lazy-first-transaction';
  /** Submit is a sink chain — embedder handler → the document's HOME
   *  (`doc.forms.submit`, engine-asserted) → blocked. Never auto-network. */
  submitForm: 'sink-chain';
  openAction: 'execute-lifecycle';
  pageActions: 'execute-lifecycle';
  /** WC/WS/DS/WP/DP run when the VERB OWNER dispatches them. */
  catalogLifecycleActions: 'execute-on-verb';
  annotationActions: 'execute-full-matrix';
}

export const DEFAULT_SCRIPT_SECURITY_POLICY: Readonly<ScriptSecurityPolicy> = Object.freeze({
  enabled: false,
  executionOwner: 'originating-client-only',
  nameTreeBoot: 'lazy-first-transaction',
  submitForm: 'sink-chain',
  openAction: 'execute-lifecycle',
  pageActions: 'execute-lifecycle',
  catalogLifecycleActions: 'execute-on-verb',
  annotationActions: 'execute-full-matrix',
});

/** The shipped dispatch matrix; extracted actions outside it remain data
 *  only. (Historical note: v1 froze everything beyond K/V/C/F as
 *  preserve-only; phases 1–4 executed the rest.) */
export const SCRIPT_EVENT_MATRIX = Object.freeze({
  nameTree: 'lazy-first-originating-field-transaction',
  field: Object.freeze({
    keystroke: 'execute-on-commit',
    validate: 'execute',
    calculate: 'execute-in-calculation-order',
    format: 'execute-after-value-calculation',
  }),
  openAction: 'execute-lifecycle',
  page: 'execute-lifecycle',
  catalogLifecycle: 'execute-on-verb',
  annotation: Object.freeze({
    widgetActivate: 'execute-on-originating-client',
    other: 'execute-full-matrix',
  }),
  submitForm: 'sink-chain',
} as const);

/** Functions installed into the isolated VM global by `PRELUDE_SOURCE`. */
export interface AcroJsVmGlobal {
  __acrojsBoot(
    sources: string[],
    input: ScriptInput,
    budget?: Pick<ScriptBudget, 'maxEffects'>,
  ): ScriptOutput;
  __acrojsRun(
    source: string,
    input: ScriptInput,
    budget?: Pick<ScriptBudget, 'maxEffects'>,
  ): ScriptOutput;
}
