/**
 * The K/V/C/F transaction: keystroke, validate, calculate and format passes
 * over one overlay, committed to the engine inside the realm transaction.
 */
import type { DocumentMeta } from '@embedpdf/core';
import {
  DEFAULT_SCRIPT_BUDGET,
  javaScriptProgramFromActionTree,
  scriptFieldsFromSnapshot,
  type ScriptBudget,
  type ScriptDiagnostic,
  type ScriptExecutionError,
  type ScriptFieldInput,
  type ScriptOutput,
  type ScriptTransaction,
  type ScriptValue,
  type ScriptWorldInput,
} from '@embedpdf/core-acrojs';
import type {
  DocumentHandle,
  FormEffect,
  FormFieldRef,
  FormFieldValue,
  PdfActionTree,
} from '@embedpdf/engine-core/runtime';

import type { FormCommitResult, FormUiEffect } from '../contract';
import {
  applyEffects,
  canonicalEffects,
  cloneFields,
  cloneValue,
  fieldByRef,
  refKey,
  sameRef,
  scriptValueFromFormValue,
  snapshotField,
  type Overlay,
} from './overlay';
import { pageNumberFor, scriptError, statusFromEffects, utf8Length } from './results';

/**
 * The controller never owns a realm. It rides a realm port — this document's
 * own (the actions plugin's per-document host) or a detached one minted by
 * the actions plugin for a document that is not displayed (stamp's
 * asset documents). Either way the owner disposes the realm; `dispose()`
 * here only fences further transactions.
 */
export interface FormScriptingControllerOptions {
  doc: DocumentHandle;
  /** What the scripts read of the document: its name, page count and pages. */
  document(): Pick<DocumentMeta, 'name' | 'pageCount' | 'pages'> | null;
  /** The realm's transaction port ({@link ScriptTransaction}). The K/V/C/F
   *  pipeline runs wholly inside one transaction: snapshot fetch, every
   *  pass, and the engine commit — the commit-inside-the-boundary law. */
  transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
  /** The transaction aggregate (output bytes, wall-clock across passes);
   *  the realm owner hands over the same budget its runs enforce. */
  budget?: ScriptBudget;
}

export class FormScriptingController {
  private disposed = false;
  private readonly transaction: <T>(body: (txn: ScriptTransaction) => Promise<T>) => Promise<T>;
  private readonly transactionBudget: ScriptBudget | undefined;

  constructor(private readonly options: FormScriptingControllerOptions) {
    this.transaction = options.transaction.bind(options);
    this.transactionBudget = options.budget;
  }

  /** The realm belongs to its owner (the actions plugin, or the caller that
   *  minted a detached one) — this only fences further transactions. */
  dispose(): void {
    this.disposed = true;
  }

  async commit(ref: FormFieldRef, proposed: FormFieldValue): Promise<FormCommitResult> {
    return this.transact(ref, proposed);
  }

  /** Execute one originating widget's activation action (`/A`, including `/Next`). */
  async activate(ref: FormFieldRef, action: PdfActionTree): Promise<FormCommitResult> {
    return this.transact(ref, undefined, action);
  }

  /** Run lazy document boot plus the `/CO` chain without a user field change.
   *  The anchor field resolves inside the transaction (undefined ref). */
  async recalculate(): Promise<FormCommitResult> {
    return this.transact(undefined);
  }

  private async transact(
    refInput: FormFieldRef | undefined,
    proposed?: FormFieldValue,
    activation?: PdfActionTree,
  ): Promise<FormCommitResult> {
    if (this.disposed) throw new Error('Form scripting controller is disposed');
    // Everything inside the realm transaction — snapshot fetch, every pass,
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
    // Recalculate's anchor resolves here (first live /CO field, else the
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
    // Document/identity/environment are host-owned now; the world carries the
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
      // Tag every UI request with who asked — embedders suppress boot-phase
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
    const world = (
      fields: ScriptFieldInput[],
      event: ScriptWorldInput['event'],
    ): ScriptWorldInput => ({
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
      // Boot runs once per realm (host-owned latch) and can only ever
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
        const activated = await run(
          program,
          world(overlay.fields, {
            kind: 'widget-activate',
            target: ref,
            source: ref,
            value: targetInput.value,
          }),
        );
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
        // event. This pipeline compresses typing into one paste-shaped
        // replacement (Acrobat's own paste contract: the whole string rides
        // `event.change`, willCommit=false) so transform/filter scripts run,
        // then fires the Acrobat-faithful willCommit pass (the full value on
        // `event.value`, empty `change`) so AF* and commit validators see
        // what Adobe's library expects.
        const oldValue = String(targetInput.value ?? '');
        const typing = await run(
          program,
          world(overlay.fields, {
            kind: 'field-keystroke',
            target: ref,
            source: ref,
            value: oldValue,
            change: String(proposedValue ?? ''),
            selStart: 0,
            selEnd: oldValue.length,
            willCommit: false,
          }),
        );
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
        const commit = await run(
          program,
          world(overlay.fields, {
            kind: 'field-keystroke',
            target: ref,
            source: ref,
            value: proposedValue,
            change: '',
            selStart: 0,
            selEnd: 0,
            willCommit: true,
          }),
        );
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
        const validation = await run(
          program,
          world(overlay.fields, {
            kind: 'field-validate',
            target: ref,
            source: ref,
            value: proposedValue,
            willCommit: true,
          }),
        );
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
