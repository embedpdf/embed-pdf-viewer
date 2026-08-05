import {
  DEFAULT_SCRIPT_BUDGET,
  PRELUDE_SOURCE,
  type ScriptBudget,
  type ScriptExecutionError,
  type ScriptInput,
  type ScriptOutput,
  type ScriptValue,
} from '@embedpdf/core-acrojs';
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSRuntime,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';
import quickJsVariant from '#quickjs-variant';

import type { QuickJsSandboxOptions, ScriptSandbox } from './types';

let sharedModulePromise: Promise<QuickJSWASMModule> | undefined;

function getSharedModule(): Promise<QuickJSWASMModule> {
  sharedModulePromise ??= newQuickJSWASMModuleFromVariant(quickJsVariant);
  return sharedModulePromise;
}

function assertBudget(budget: ScriptBudget): ScriptBudget {
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`ScriptBudget.${name} must be a positive safe integer`);
    }
  }
  return budget;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScriptValue(value: unknown): value is ScriptValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
  );
}

/** Validate the untrusted VM boundary, where TypeScript types do not exist. */
function isScriptOutput(value: unknown): value is ScriptOutput {
  if (!isRecord(value) || !isRecord(value.event)) return false;
  const event = value.event;
  const arraysAreRecords = (candidate: unknown): boolean =>
    Array.isArray(candidate) && candidate.every(isRecord);
  if (
    typeof event.rc !== 'boolean' ||
    !isScriptValue(event.value) ||
    typeof event.change !== 'string' ||
    !Number.isSafeInteger(event.selStart) ||
    !Number.isSafeInteger(event.selEnd) ||
    !arraysAreRecords(value.formEffects) ||
    !arraysAreRecords(value.uiEffects) ||
    !arraysAreRecords(value.diagnostics)
  ) {
    return false;
  }
  if (value.error === undefined) return true;
  return (
    isRecord(value.error) &&
    (value.error.kind === 'exception' ||
      value.error.kind === 'budget' ||
      value.error.kind === 'invalid-output') &&
    typeof value.error.message === 'string' &&
    (value.error.stack === undefined || typeof value.error.stack === 'string')
  );
}

function errorMessage(value: unknown): string {
  if (isRecord(value)) {
    const name = typeof value.name === 'string' ? `${value.name}: ` : '';
    if (typeof value.message === 'string') return `${name}${value.message}`;
  }
  return String(value);
}

function isResourceError(error: ScriptExecutionError | undefined): boolean {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('interrupted') ||
    message.includes('out of memory') ||
    message.includes('stack overflow')
  );
}

function failedOutput(
  input: ScriptInput,
  kind: ScriptExecutionError['kind'],
  message: string,
): ScriptOutput {
  const target = input.event.target
    ? input.fields.find((field) => {
        const ref = field.ref;
        const targetRef = input.event.target!;
        return ref.kind === 'objectNumber' && targetRef.kind === 'objectNumber'
          ? ref.fieldObjectNumber === targetRef.fieldObjectNumber
          : ref.kind === 'fqn' && targetRef.kind === 'fqn'
            ? ref.name === targetRef.name
            : false;
      })
    : undefined;
  return {
    event: {
      rc: false,
      value: input.event.value ?? target?.value ?? null,
      change: input.event.change ?? '',
      selStart: input.event.selStart ?? 0,
      selEnd: input.event.selEnd ?? 0,
    },
    formEffects: [],
    uiEffects: [],
    diagnostics: [],
    error: { kind, message },
  };
}

export class QuickJsSandbox implements ScriptSandbox {
  private readonly runtime: QuickJSRuntime;
  private readonly context: QuickJSContext;
  private hasBooted = false;
  private isDisposed = false;

  static create(module: QuickJSWASMModule, options: QuickJsSandboxOptions = {}): QuickJsSandbox {
    const runtime = module.newRuntime();
    runtime.setMemoryLimit(DEFAULT_SCRIPT_BUDGET.maxMemoryBytes);
    runtime.setMaxStackSize(DEFAULT_SCRIPT_BUDGET.maxStackBytes);
    const context = runtime.newContext();

    try {
      const result = context.evalCode(
        options.preludeSource ?? PRELUDE_SOURCE,
        'embedpdf-acrojs-prelude.js',
        { type: 'global' },
      );
      if (result.error) {
        const message = errorMessage(context.dump(result.error));
        result.error.dispose();
        throw new Error(`Failed to install the AcroJS prelude: ${message}`);
      }
      result.value.dispose();
      return new QuickJsSandbox(runtime, context);
    } catch (error) {
      context.dispose();
      runtime.dispose();
      throw error;
    }
  }

  private constructor(runtime: QuickJSRuntime, context: QuickJSContext) {
    this.runtime = runtime;
    this.context = context;
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  boot(
    sources: string[],
    input: ScriptInput,
    budget: ScriptBudget = DEFAULT_SCRIPT_BUDGET,
  ): ScriptOutput {
    this.assertActive();
    if (this.hasBooted) throw new Error('The document JavaScript name tree has already booted');
    this.hasBooted = true;
    return this.invoke('__acrojsBoot', sources, input, assertBudget(budget));
  }

  run(
    source: string,
    input: ScriptInput,
    budget: ScriptBudget = DEFAULT_SCRIPT_BUDGET,
  ): ScriptOutput {
    this.assertActive();
    return this.invoke('__acrojsRun', source, input, assertBudget(budget));
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.context.dispose();
    this.runtime.dispose();
  }

  private assertActive(): void {
    if (this.isDisposed) throw new Error('The script sandbox has been disposed');
  }

  private poison(): void {
    try {
      this.dispose();
    } catch {
      // The instance remains permanently marked disposed even if QuickJS itself
      // reports a teardown assertion after a fatal runtime condition.
    }
  }

  private invoke(
    method: '__acrojsBoot' | '__acrojsRun',
    firstArgument: string[] | string,
    input: ScriptInput,
    budget: ScriptBudget,
  ): ScriptOutput {
    this.runtime.setMemoryLimit(budget.maxMemoryBytes);
    this.runtime.setMaxStackSize(budget.maxStackBytes);

    const deadline = Date.now() + budget.maxExecutionMs;
    let interrupted = false;
    this.runtime.setInterruptHandler(() => {
      interrupted = Date.now() >= deadline;
      return interrupted;
    });

    let dumped: unknown;
    try {
      const call = `globalThis.${method}(${JSON.stringify(firstArgument)},${JSON.stringify(
        input,
      )},${JSON.stringify({ maxEffects: budget.maxEffects })})`;
      const result = this.context.evalCode(call, 'embedpdf-acrojs-event.js', { type: 'global' });
      if (result.error) {
        dumped = this.context.dump(result.error);
        result.error.dispose();
        const kind = interrupted ? 'budget' : 'invalid-output';
        const output = failedOutput(input, kind, errorMessage(dumped));
        this.poison();
        return output;
      }
      dumped = this.context.dump(result.value);
      result.value.dispose();
    } catch (error) {
      const output = failedOutput(
        input,
        interrupted ? 'budget' : 'invalid-output',
        error instanceof Error ? error.message : String(error),
      );
      this.poison();
      return output;
    } finally {
      if (!this.isDisposed) this.runtime.removeInterruptHandler();
    }

    if (!isScriptOutput(dumped)) {
      const output = failedOutput(input, 'invalid-output', 'AcroJS returned an invalid output');
      this.poison();
      return output;
    }

    if (interrupted || isResourceError(dumped.error)) {
      const output = failedOutput(
        input,
        'budget',
        interrupted ? 'Script execution exceeded its time budget' : dumped.error!.message,
      );
      this.poison();
      return output;
    }

    const outputBytes = new TextEncoder().encode(JSON.stringify(dumped)).byteLength;
    if (outputBytes > budget.maxOutputBytes) {
      const output = failedOutput(
        input,
        'budget',
        `Script output used ${outputBytes} bytes; limit is ${budget.maxOutputBytes}`,
      );
      this.poison();
      return output;
    }

    return dumped;
  }
}

/** Async because the shared QuickJS WebAssembly module must initialize first. */
export async function createQuickJsSandbox(
  options: QuickJsSandboxOptions = {},
): Promise<ScriptSandbox> {
  return QuickJsSandbox.create(await getSharedModule(), options);
}
