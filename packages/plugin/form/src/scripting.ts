import type {
  DocumentHandle,
  FormEffect,
  FormEffectsResult,
  FormFieldDTO,
  FormFieldRef,
  FormFieldValue,
  FormSnapshot,
  PdfActionTree,
} from '@embedpdf/engine-core/runtime';
import {
  createScriptHost,
  DEFAULT_SCRIPT_BUDGET,
  javaScriptProgramFromActionTree,
  resolveScriptIdentity,
  scriptFieldsFromSnapshot,
  seedFrom,
  type ScriptBudget,
  type ScriptDiagnostic,
  type ScriptExecutionError,
  type ScriptFieldInput,
  type ScriptOutput,
  type ScriptTransaction,
  type ScriptUiEffect,
  type ScriptValue,
  type ScriptWorldInput,
} from '@embedpdf/core-acrojs';
import type { DocumentMeta } from '@embedpdf/core';

import type { FormCommitResult, FormScriptingOptions, FormUiEffect } from './types';

interface Overlay {
  original: ScriptFieldInput[];
  fields: ScriptFieldInput[];
  resetKeys: Set<string>;
  appearances: Map<string, { ref: FormFieldRef; text: string }>;
}

export type FormScriptingControllerOptions = {
  doc: DocumentHandle;
  document(): DocumentMeta | null;
} & (
  | {
      /** The shared realm's transaction port ({@link ScriptTransaction}) —
       *  the actions plugin's per-document host. The K/V/C/F pipeline runs
       *  WHOLLY inside one transaction: snapshot fetch, every pass, and the
       *  engine commit — the commit-inside-the-boundary law. */
      transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
      budget?: ScriptBudget;
    }
  | {
      /** Standalone convenience (stamp's detached documents, direct tests):
       *  the controller builds and OWNS its own realm via
       *  {@link createFormScriptingHost}; `dispose()` releases it. */
      config: FormScriptingOptions;
    }
);

/**
 * A STANDALONE realm for one document, configured with the legacy
 * `FormScriptingOptions` vocabulary — stamp's detached stamp-asset documents
 * and direct controller tests construct their own host here; viewer
 * documents get theirs from `actionsPlugin({ javascript })`.
 */
export function createFormScriptingHost(options: {
  doc: DocumentHandle;
  document(): DocumentMeta | null;
  config: FormScriptingOptions;
}): {
  transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
  dispose(): void;
} {
  const { doc, config } = options;
  const host = createScriptHost({
    sandboxFactory:
      config.sandboxFactory ??
      (() =>
        import('@embedpdf/core-js-sandbox').then(({ createQuickJsSandbox }) =>
          createQuickJsSandbox(),
        )),
    document: () => {
      const meta = options.document();
      return {
        id: doc.id,
        fileName: config.fileName?.() ?? meta?.name ?? doc.id,
        pageCount: meta?.pageCount ?? 0,
        pageNumber: 0,
      };
    },
    identity: () => resolveScriptIdentity(doc, config.identity),
    environment: (sequence) => {
      const nowMs = config.now?.() ?? Date.now();
      return {
        nowMs,
        utcOffsetMinutes: config.utcOffsetMinutes?.() ?? -new Date(nowMs).getTimezoneOffset(),
        randomSeed: config.randomSeed?.() ?? seedFrom(doc.id, sequence),
      };
    },
    bootSources: async () => {
      const actions = doc.actions ? await doc.actions.read() : null;
      return (
        actions?.nameTreeScripts.map(({ action }) => javaScriptProgramFromActionTree(action)) ?? []
      );
    },
    ...(config.budget ? { budget: config.budget } : {}),
  });
  return { transaction: host.transaction.bind(host), dispose: () => host.dispose() };
}

const refKey = (ref: FormFieldRef): string =>
  ref.kind === 'objectNumber' ? `obj:${ref.fieldObjectNumber}` : `fqn:${ref.name}`;

const sameRef = (left: FormFieldRef, right: FormFieldRef): boolean =>
  refKey(left) === refKey(right);

const cloneValue = (value: ScriptValue): ScriptValue => (Array.isArray(value) ? [...value] : value);

const sameValue = (left: ScriptValue, right: ScriptValue): boolean =>
  Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;

function cloneFields(fields: ScriptFieldInput[]): ScriptFieldInput[] {
  return fields.map((field) => ({
    ...field,
    ref: { ...field.ref },
    value: cloneValue(field.value),
    defaultValue: cloneValue(field.defaultValue),
    ...(field.options ? { options: field.options.map((option) => ({ ...option })) } : {}),
  }));
}

function fieldByRef<T extends { ref: FormFieldRef }>(
  fields: T[],
  ref: FormFieldRef,
): T | undefined {
  return fields.find((field) => sameRef(field.ref, ref));
}

function snapshotField(snapshot: FormSnapshot, ref: FormFieldRef): FormFieldDTO | undefined {
  return snapshot.fields.find((field) => sameRef(field.ref, ref));
}

function scriptValueFromFormValue(field: ScriptFieldInput, value: FormFieldValue): ScriptValue {
  if (field.family === 'text' && value.type === 'text') return value.value;
  if ((field.family === 'checkbox' || field.family === 'radio') && value.type === 'toggle') {
    return value.state ?? 'Off';
  }
  if (field.family === 'combobox' && value.type === 'choice') return value.values[0] ?? '';
  if (field.family === 'listbox' && value.type === 'choice') return [...value.values];
  throw new Error(`Form value type '${value.type}' does not match field family '${field.family}'`);
}

function formValueFromScriptValue(field: ScriptFieldInput): FormFieldValue | null {
  switch (field.family) {
    case 'text':
      return { type: 'text', value: String(field.value ?? '') };
    case 'checkbox':
    case 'radio':
      return {
        type: 'toggle',
        state:
          field.value === null || field.value === undefined || String(field.value) === 'Off'
            ? null
            : String(field.value),
      };
    case 'combobox':
      return {
        type: 'choice',
        values: Array.isArray(field.value) ? field.value.slice(0, 1) : [String(field.value ?? '')],
      };
    case 'listbox':
      return {
        type: 'choice',
        values: Array.isArray(field.value) ? [...field.value] : [String(field.value ?? '')],
      };
    default:
      return null;
  }
}

function applyEffects(overlay: Overlay, effects: FormEffect[]): void {
  for (const effect of effects) {
    if (effect.kind === 'reset') {
      for (const ref of effect.refs) {
        const field = fieldByRef(overlay.fields, ref);
        if (!field) continue;
        field.value = cloneValue(field.defaultValue);
        overlay.resetKeys.add(refKey(ref));
      }
      continue;
    }

    const field = fieldByRef(overlay.fields, effect.ref);
    if (!field) continue;
    const key = refKey(effect.ref);
    if (effect.kind === 'setValue') {
      field.value = scriptValueFromFormValue(field, effect.value);
      overlay.resetKeys.delete(key);
    } else if (effect.kind === 'setDisplay') {
      field.display = effect.display;
    } else {
      overlay.appearances.set(key, { ref: effect.ref, text: effect.text });
    }
  }
}

function canonicalEffects(overlay: Overlay): FormEffect[] {
  const effects: FormEffect[] = [];
  const resets: FormFieldRef[] = [];
  for (const field of overlay.fields) {
    const original = fieldByRef(overlay.original, field.ref);
    if (!original) continue;
    if (!sameValue(original.value, field.value)) {
      const key = refKey(field.ref);
      if (overlay.resetKeys.has(key) && sameValue(field.value, field.defaultValue)) {
        resets.push(field.ref);
      } else {
        const value = formValueFromScriptValue(field);
        if (value) effects.push({ kind: 'setValue', ref: field.ref, value });
      }
    }
    if (original.display !== field.display) {
      effects.push({ kind: 'setDisplay', ref: field.ref, display: field.display });
    }
  }
  if (resets.length > 0) effects.unshift({ kind: 'reset', refs: resets });
  effects.push(
    ...Array.from(overlay.appearances.values(), ({ ref, text }) => ({
      kind: 'setAppearanceText' as const,
      ref,
      text,
    })),
  );
  return effects;
}

function scriptError(message: string): ScriptExecutionError {
  return { kind: 'invalid-output', message };
}

function utf8Length(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
}

function pageNumberFor(meta: DocumentMeta | null, field: FormFieldDTO): number {
  const pon = field.widgets.find((widget) => widget.pageObjectNumber > 0)?.pageObjectNumber;
  if (!meta || pon === undefined) return 0;
  const index = meta.pages.findIndex((page) => page.pageObjectNumber === pon);
  return Math.max(0, index);
}

function statusFromEffects(result: FormEffectsResult): FormCommitResult['status'] {
  if (result.results.some(({ status }) => status === 'failed' || status === 'skipped')) {
    return 'failed';
  }
  if (result.results.some(({ status }) => status === 'rejected')) return 'failed';
  return result.results.some(({ status }) => status === 'applied') ? 'applied' : 'unchanged';
}

export class FormScriptingController {
  private disposed = false;
  private readonly transaction: <T>(body: (txn: ScriptTransaction) => Promise<T>) => Promise<T>;
  private readonly transactionBudget: ScriptBudget | undefined;
  private readonly ownedHost: { dispose(): void } | null;

  constructor(private readonly options: FormScriptingControllerOptions) {
    if ('transaction' in options) {
      this.transaction = options.transaction.bind(options);
      this.transactionBudget = options.budget;
      this.ownedHost = null;
    } else {
      const host = createFormScriptingHost({
        doc: options.doc,
        document: () => options.document(),
        config: options.config,
      });
      this.transaction = host.transaction;
      this.transactionBudget = options.config.budget;
      this.ownedHost = host;
    }
  }

  /** A shared realm belongs to its HOST (the actions plugin) — this only
   *  fences further transactions; a standalone-owned realm is released. */
  dispose(): void {
    this.disposed = true;
    this.ownedHost?.dispose();
  }

  async commit(ref: FormFieldRef, proposed: FormFieldValue): Promise<FormCommitResult> {
    return this.transact(ref, proposed);
  }

  /** Execute one originating widget's activation action (`/A`, including `/Next`). */
  async activate(ref: FormFieldRef, action: PdfActionTree): Promise<FormCommitResult> {
    return this.transact(ref, undefined, action);
  }

  /** Run lazy document boot plus the `/CO` chain without a user field change.
   *  The anchor field resolves INSIDE the transaction (undefined ref). */
  async recalculate(): Promise<FormCommitResult> {
    return this.transact(undefined);
  }


  private async transact(
    refInput: FormFieldRef | undefined,
    proposed?: FormFieldValue,
    activation?: PdfActionTree,
  ): Promise<FormCommitResult> {
    if (this.disposed) throw new Error('Form scripting controller is disposed');
    // EVERYTHING inside the realm transaction — snapshot fetch, every pass,
    // the engine commit — so the next transaction reads post-commit truth.
    return this.transaction((txn) => this.transactBody(txn, refInput, proposed, activation));
  }

  private async transactBody(
    txn: ScriptTransaction,
    refInput: FormFieldRef | undefined,
    proposed?: FormFieldValue,
    activation?: PdfActionTree,
  ): Promise<FormCommitResult> {
    const snapshot = await this.options.doc.forms.list();
    // Recalculate's anchor resolves HERE (first live /CO field, else the
    // first field); a zero-field document is an honest no-op.
    const ref =
      refInput ??
      snapshot.calculationOrder.find(
        (candidate): candidate is FormFieldRef =>
          candidate !== null && snapshotField(snapshot, candidate) !== undefined,
      ) ??
      snapshot.fields[0]?.ref;
    if (!ref) {
      return {
        status: 'unchanged',
        scripted: true,
        effectsResult: null,
        uiEffects: [],
        diagnostics: [],
      };
    }
    const target = snapshotField(snapshot, ref);
    if (!target) {
      return this.failed([], [], scriptError(`Form field '${refKey(ref)}' no longer exists`));
    }

    const original = scriptFieldsFromSnapshot(snapshot);
    const overlay: Overlay = {
      original,
      fields: cloneFields(original),
      resetKeys: new Set(),
      appearances: new Map(),
    };
    const targetInput = fieldByRef(overlay.fields, ref);
    if (!targetInput) {
      return this.failed([], [], scriptError(`Form field '${refKey(ref)}' has no script view`));
    }

    const hasProposedValue = proposed !== undefined;
    let proposedValue: ScriptValue = cloneValue(targetInput.value);
    if (proposed) {
      try {
        proposedValue = scriptValueFromFormValue(targetInput, proposed);
      } catch (error) {
        return this.failed(
          [],
          [],
          scriptError(error instanceof Error ? error.message : String(error)),
        );
      }
    }

    const uiEffects: FormUiEffect[] = [];
    const diagnostics: ScriptDiagnostic[] = [];
    const meta = this.options.document();
    // Document/identity/environment are HOST-owned now; the world carries the
    // per-field current page for `this.pageNum`.
    const pageNumber = pageNumberFor(meta, target);
    const budget = this.transactionBudget ?? DEFAULT_SCRIPT_BUDGET;
    let executionMs = 0;
    let aggregateOutputSize = 0;

    const consume = (
      output: ScriptOutput,
      phase: FormUiEffect['phase'],
    ): ScriptExecutionError | null => {
      aggregateOutputSize += utf8Length(JSON.stringify(output));
      // Tag every UI request with WHO asked — embedders suppress boot-phase
      // nags (Adobe's version-check alert) but show user-phase validation.
      uiEffects.push(...output.uiEffects.map((effect) => ({ ...effect, phase })));
      diagnostics.push(...output.diagnostics);
      if (aggregateOutputSize > budget.maxOutputBytes) {
        return {
          kind: 'budget',
          message: `Form script transaction output exceeded ${budget.maxOutputBytes} bytes`,
        };
      }
      return output.error ?? null;
    };
    const remainingBudget = (): ScriptBudget | null => {
      const remaining = budget.maxExecutionMs - executionMs;
      return remaining <= 0 ? null : { ...budget, maxExecutionMs: remaining };
    };
    const world = (fields: ScriptFieldInput[], event: ScriptWorldInput['event']): ScriptWorldInput => ({
      fields,
      pageNumber,
      event,
    });
    const run = async (
      source: string,
      input: ScriptWorldInput,
    ): Promise<{ output?: ScriptOutput; error?: ScriptExecutionError }> => {
      const remaining = remainingBudget();
      if (!remaining) {
        return { error: { kind: 'budget', message: 'Form script transaction timed out' } };
      }
      let output: ScriptOutput;
      try {
        const startedAt = Date.now();
        output = await txn.run(source, input, remaining);
        executionMs += Date.now() - startedAt;
      } catch (error) {
        return {
          error: scriptError(error instanceof Error ? error.message : String(error)),
        };
      }
      const error = consume(output, 'user');
      return error ? { error } : { output };
    };

    {
      // Boot runs ONCE per realm (host-owned latch) and can only ever
      // degrade, never brick — a failure surfaces a diagnostic and this
      // transaction continues from pristine state.
      let boot: ScriptOutput | null = null;
      try {
        boot = await txn.boot(world(overlay.fields, { kind: 'name-tree-boot' }), budget);
      } catch (error) {
        diagnostics.push({
          code: 'script-error',
          message: `Document boot script failed (continuing without it): ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      if (boot) {
        const bootError = consume(boot, 'boot');
        if (!bootError) applyEffects(overlay, boot.formEffects);
        else {
          diagnostics.push({
            code: 'script-error',
            message: `Document boot script failed (continuing without it): ${bootError.message}`,
          });
        }
      }
    }

    const bootEffects = canonicalEffects(overlay);

    if (activation) {
      let program: string;
      try {
        program = javaScriptProgramFromActionTree(activation);
      } catch (error) {
        return this.failed(
          uiEffects,
          diagnostics,
          scriptError(error instanceof Error ? error.message : String(error)),
        );
      }
      if (program) {
        const activated = await run(program, world(overlay.fields, {
            kind: 'widget-activate',
            target: ref,
            source: ref,
            value: targetInput.value,
          }));
        if (activated.error) return this.failed(uiEffects, diagnostics, activated.error);
        applyEffects(overlay, activated.output!.formEffects);
      }
    }

    if (!activation && hasProposedValue && target.actions?.keystroke && target.family === 'text') {
      let program: string;
      try {
        program = javaScriptProgramFromActionTree(target.actions.keystroke);
      } catch (error) {
        return this.failed(
          uiEffects,
          diagnostics,
          scriptError(error instanceof Error ? error.message : String(error)),
        );
      }
      if (program) {
        // Acrobat fires per-typing keystroke events plus one final commit
        // event. This pipeline compresses typing into ONE paste-shaped
        // replacement (Acrobat's own paste contract: the whole string rides
        // `event.change`, willCommit=false) so transform/filter scripts run,
        // then fires the Acrobat-faithful willCommit pass (the full value on
        // `event.value`, empty `change`) so AF* and commit validators see
        // what Adobe's library expects.
        const oldValue = String(targetInput.value ?? '');
        const typing = await run(program, world(overlay.fields, {
            kind: 'field-keystroke',
            target: ref,
            source: ref,
            value: oldValue,
            change: String(proposedValue ?? ''),
            selStart: 0,
            selEnd: oldValue.length,
            willCommit: false,
          }));
        if (typing.error && typing.error.kind !== 'exception') {
          return this.failed(uiEffects, diagnostics, typing.error);
        }
        if (typing.error) {
          // Fault ladder: an exception is not a rejection. Keep the typed
          // value, surface a diagnostic, and let the transaction continue.
          diagnostics.push({
            code: 'script-error',
            message: `Keystroke script failed (kept the typed value): ${typing.error.message}`,
          });
        } else {
          if (!typing.output!.event.rc) {
            return this.finishRejected(bootEffects, uiEffects, diagnostics);
          }
          applyEffects(overlay, typing.output!.formEffects);
          const event = typing.output!.event;
          const base = String(event.value ?? '');
          proposedValue =
            base.slice(0, event.selStart) +
            event.change +
            base.slice(Math.max(event.selStart, event.selEnd));
        }
        const commit = await run(program, world(overlay.fields, {
            kind: 'field-keystroke',
            target: ref,
            source: ref,
            value: proposedValue,
            change: '',
            selStart: 0,
            selEnd: 0,
            willCommit: true,
          }));
        if (commit.error && commit.error.kind !== 'exception') {
          return this.failed(uiEffects, diagnostics, commit.error);
        }
        if (commit.error) {
          diagnostics.push({
            code: 'script-error',
            message: `Keystroke commit script failed (kept the typed value): ${commit.error.message}`,
          });
        } else {
          if (!commit.output!.event.rc) {
            return this.finishRejected(bootEffects, uiEffects, diagnostics);
          }
          applyEffects(overlay, commit.output!.formEffects);
          proposedValue = cloneValue(commit.output!.event.value);
        }
      }
    }

    if (!activation && hasProposedValue) {
      targetInput.value = cloneValue(proposedValue);
      overlay.resetKeys.delete(refKey(ref));
    }

    if (!activation && hasProposedValue && target.actions?.validate) {
      let program: string;
      try {
        program = javaScriptProgramFromActionTree(target.actions.validate);
      } catch (error) {
        return this.failed(
          uiEffects,
          diagnostics,
          scriptError(error instanceof Error ? error.message : String(error)),
        );
      }
      if (program) {
        const validation = await run(program, world(overlay.fields, {
            kind: 'field-validate',
            target: ref,
            source: ref,
            value: proposedValue,
            willCommit: true,
          }));
        if (validation.error && validation.error.kind !== 'exception') {
          return this.failed(uiEffects, diagnostics, validation.error);
        }
        if (validation.error) {
          // Fault ladder: a broken validator must not reject the value.
          diagnostics.push({
            code: 'script-error',
            message: `Validate script failed (accepted the value): ${validation.error.message}`,
          });
        } else {
          if (!validation.output!.event.rc) {
            return this.finishRejected(bootEffects, uiEffects, diagnostics);
          }
          targetInput.value = cloneValue(validation.output!.event.value);
          applyEffects(overlay, validation.output!.formEffects);
        }
      }
    }

    const formatRefs: FormFieldRef[] = !activation && hasProposedValue ? [ref] : [];
    for (const calculationRef of activation ? [] : snapshot.calculationOrder) {
      if (!calculationRef) continue;
      const calculated = snapshotField(snapshot, calculationRef);
      const tree = calculated?.actions?.calculate;
      if (!calculated || !tree) continue;
      let program: string;
      try {
        program = javaScriptProgramFromActionTree(tree);
      } catch (error) {
        return this.failed(
          uiEffects,
          diagnostics,
          scriptError(error instanceof Error ? error.message : String(error)),
        );
      }
      const calculatedInput = fieldByRef(overlay.fields, calculationRef);
      if (program && calculatedInput) {
        const calculation = await run(
          program,
          world(overlay.fields, {
            kind: 'field-calculate',
            target: calculationRef,
            ...(hasProposedValue ? { source: ref } : {}),
            value: calculatedInput.value,
          }),
        );
        if (calculation.error && calculation.error.kind !== 'exception') {
          return this.failed(uiEffects, diagnostics, calculation.error);
        }
        if (calculation.error) {
          // Fault ladder: this field's calculation is skipped; the /CO chain continues.
          diagnostics.push({
            code: 'script-error',
            message: `Calculate script failed (field left unchanged): ${calculation.error.message}`,
          });
        } else {
          applyEffects(overlay, calculation.output!.formEffects);
        }
      }
      if (!formatRefs.some((candidate) => sameRef(candidate, calculationRef))) {
        formatRefs.push(calculationRef);
      }
    }

    for (const formatRef of formatRefs) {
      const field = snapshotField(snapshot, formatRef);
      const tree = field?.actions?.format;
      const overlayField = fieldByRef(overlay.fields, formatRef);
      if (!field || !tree || !overlayField) continue;
      let program: string;
      try {
        program = javaScriptProgramFromActionTree(tree);
      } catch (error) {
        return this.failed(
          uiEffects,
          diagnostics,
          scriptError(error instanceof Error ? error.message : String(error)),
        );
      }
      if (!program) continue;
      const format = await run(
        program,
        world(overlay.fields, {
          kind: 'field-format',
          target: formatRef,
          ...(hasProposedValue ? { source: ref } : {}),
          value: overlayField.value,
        }),
      );
      if (format.error && format.error.kind !== 'exception') {
        return this.failed(uiEffects, diagnostics, format.error);
      }
      if (format.error) {
        // Fault ladder: formatting is cosmetic — skip it, keep the raw value.
        diagnostics.push({
          code: 'script-error',
          message: `Format script failed (kept the raw value): ${format.error.message}`,
        });
        continue;
      }
      applyEffects(overlay, format.output!.formEffects);
    }

    const effects = canonicalEffects(overlay);
    if (effects.length + uiEffects.length > budget.maxEffects) {
      return this.failed(uiEffects, diagnostics, {
        kind: 'budget',
        message: `Form script transaction exceeded ${budget.maxEffects} effects`,
      });
    }
    if (effects.length === 0) {
      return { status: 'unchanged', scripted: true, effectsResult: null, uiEffects, diagnostics };
    }
    if (!this.options.doc.forms.applyEffects) {
      return this.failed(
        uiEffects,
        diagnostics,
        scriptError('This engine does not support batched form effects'),
      );
    }

    const effectsResult = await this.options.doc.forms.applyEffects(effects);
    const status = statusFromEffects(effectsResult);
    return {
      status,
      scripted: true,
      effectsResult,
      uiEffects,
      diagnostics,
      ...(status === 'failed'
        ? { error: scriptError('One or more native form effects failed') }
        : {}),
    };
  }

  private failed(
    uiEffects: FormUiEffect[],
    diagnostics: ScriptDiagnostic[],
    error: ScriptExecutionError,
  ): FormCommitResult {
    return {
      status: 'failed',
      scripted: true,
      effectsResult: null,
      uiEffects,
      diagnostics,
      error,
    };
  }

  private async finishRejected(
    bootEffects: FormEffect[],
    uiEffects: FormUiEffect[],
    diagnostics: ScriptDiagnostic[],
  ): Promise<FormCommitResult> {
    if (bootEffects.length === 0) {
      return {
        status: 'rejected',
        scripted: true,
        effectsResult: null,
        uiEffects,
        diagnostics,
      };
    }
    if (!this.options.doc.forms.applyEffects) {
      return this.failed(
        uiEffects,
        diagnostics,
        scriptError('Batched form effects are unavailable'),
      );
    }
    const effectsResult = await this.options.doc.forms.applyEffects(bootEffects);
    if (statusFromEffects(effectsResult) === 'failed') {
      return this.failed(uiEffects, diagnostics, scriptError('A name-tree boot effect failed'));
    }
    return {
      status: 'rejected',
      scripted: true,
      effectsResult,
      uiEffects,
      diagnostics,
    };
  }
}

export function createFormScriptingController(
  options: FormScriptingControllerOptions,
): FormScriptingController {
  return new FormScriptingController(options);
}
