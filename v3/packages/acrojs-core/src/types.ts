import type {
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

/** Complete input for one deterministic run. No ambient host values are read. */
export interface ScriptInput {
  document: ScriptDocumentInput;
  identity: ScriptIdentity;
  environment: ScriptEnvironment;
  fields: ScriptFieldInput[];
  event: ScriptEventInput;
}

export type ScriptUiEffect =
  | { kind: 'alert'; message: string; icon: number; title?: string }
  | { kind: 'print' }
  | { kind: 'gotoPage'; page: number };

export type ScriptDiagnosticCode =
  | 'blocked-network'
  | 'unsupported-api'
  | 'invalid-field-value'
  // A document-level script failed and was degraded to a warning (a boot
  // script error must never disable interactive filling).
  | 'script-error';

export interface ScriptDiagnostic {
  code: ScriptDiagnosticCode;
  message: string;
}

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

/** Effects are committed only by the originating client's orchestrator. */
export interface ScriptOutput {
  event: ScriptEventOutput;
  formEffects: FormEffect[];
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

/** V1 security posture. The only configurable switch is explicit opt-in. */
export interface ScriptSecurityPolicy {
  enabled: boolean;
  executionOwner: 'originating-client-only';
  nameTreeBoot: 'lazy-first-transaction';
  submitForm: 'blocked';
  openAction: 'preserve-only';
  pageActions: 'preserve-only';
  catalogLifecycleActions: 'preserve-only';
  annotationActions: 'widget-activate-only';
}

export const DEFAULT_SCRIPT_SECURITY_POLICY: Readonly<ScriptSecurityPolicy> = Object.freeze({
  enabled: false,
  executionOwner: 'originating-client-only',
  nameTreeBoot: 'lazy-first-transaction',
  submitForm: 'blocked',
  openAction: 'preserve-only',
  pageActions: 'preserve-only',
  catalogLifecycleActions: 'preserve-only',
  annotationActions: 'widget-activate-only',
});

/** Frozen V1 dispatch matrix; extracted actions outside it remain data only. */
export const SCRIPT_EVENT_MATRIX = Object.freeze({
  nameTree: 'lazy-first-originating-field-transaction',
  field: Object.freeze({
    keystroke: 'execute-on-commit',
    validate: 'execute',
    calculate: 'execute-in-calculation-order',
    format: 'execute-after-value-calculation',
  }),
  openAction: 'preserve-only',
  page: 'preserve-only',
  catalogLifecycle: 'preserve-only',
  annotation: Object.freeze({
    widgetActivate: 'execute-on-originating-client',
    other: 'preserve-only',
  }),
  submitForm: 'blocked',
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
