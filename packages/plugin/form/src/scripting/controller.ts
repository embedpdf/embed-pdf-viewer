/**
 * The K/V/C/F passes: keystroke, validate, calculate and format scripts over
 * one working copy of the form (`overlay.ts`), inside one realm transaction.
 * The controller reads the form it is given and returns what the scripts
 * changed. Writing it is the caller's, inside the same transaction
 * (`transaction`), so the next transaction reads the form with it.
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
  FormEffect,
  FormFieldRef,
  FormFieldValue,
  FormSnapshot,
  PdfActionTree,
} from '@embedpdf/engine-core/runtime';

import type { FormUiEffect } from '../contract';
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
import { pageNumberFor, scriptError, utf8Length } from './results';

/**
 * The controller never owns a realm. It rides a realm port — this document's
 * own (the actions plugin's per-document host) or a detached one minted by
 * the actions plugin for a document that is not displayed (stamp's
 * asset documents). Either way the owner disposes the realm; `dispose()`
 * here only fences further transactions.
 */
export interface FormScriptingControllerOptions {
  /** What the scripts read of the document: its name, page count and pages. */
  document(): Pick<DocumentMeta, 'name' | 'pageCount' | 'pages'> | null;
  /** The realm's transaction port ({@link ScriptTransaction}): the realm runs one at a time. */
  transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
  /** The transaction aggregate (output bytes, wall-clock across passes);
   *  the realm owner hands over the same budget its runs enforce. */
  budget?: ScriptBudget;
}

/** What the form's scripts made of one write, before anything is written. */
export interface FormScriptResult {
  /**
   * `accepted`: write `effects`. `rejected`: a keystroke or validate script refused the value,
   * so only `bootEffects` are written. `failed`: the transaction broke (a budget, a script that
   * couldn't run), so nothing is.
   */
  readonly status: 'accepted' | 'rejected' | 'failed';
  /** What the scripts changed in the form, in the order to write it (`formEffectOps`). */
  readonly effects: FormEffect[];
  /** What the document's open scripts changed: written even when the value is refused. */
  readonly bootEffects: FormEffect[];
  readonly uiEffects: FormUiEffect[];
  readonly diagnostics: ScriptDiagnostic[];
  readonly error?: ScriptExecutionError;
}

/** The scripts one transaction can run, each against the form it is given. */
export interface FormScripts {
  /**
   * A field's new value through its keystroke and validate scripts, then the calculations and
   * the formats. `form` is the form without the value.
   */
  commit(form: FormSnapshot, ref: FormFieldRef, value: FormFieldValue): Promise<FormScriptResult>;
  /** One widget's activation action (`/A`, with `/Next`). Only its scripts run here. */
  activate(
    form: FormSnapshot,
    ref: FormFieldRef,
    action: PdfActionTree<unknown>,
  ): Promise<FormScriptResult>;
  /** The document's open scripts (once per realm) and the calculations, without a field change. */
  recalculate(form: FormSnapshot): Promise<FormScriptResult>;
}

export class FormScriptingController {
  private disposed = false;
  private readonly transactionBudget: ScriptBudget | undefined;

  constructor(private readonly options: FormScriptingControllerOptions) {
    this.transactionBudget = options.budget;
  }

  /** The realm belongs to its owner (the actions plugin, or the caller that
   *  minted a detached one) — this only fences further transactions. */
  dispose(): void {
    this.disposed = true;
  }

  /**
   * One realm transaction: `body` runs its scripts and writes what they changed before the
   * next transaction starts, so that one reads the form with it.
   */
  transaction<T>(body: (scripts: FormScripts) => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Form scripting controller is disposed'));
    return this.options.transaction((txn) =>
      body({
        commit: (form, ref, value) => this.run(txn, form, ref, value),
        activate: (form, ref, action) => this.run(txn, form, ref, undefined, action),
        recalculate: (form) => this.run(txn, form, undefined),
      }),
    );
  }

  /**
   * Load the realm before the first write needs it: the scripts' engine starts, and the
   * document's open scripts run, their effects kept for the first write as without warming.
   * Nothing is written.
   */
  async warm(form: FormSnapshot): Promise<void> {
    if (this.disposed) return;
    const budget = this.transactionBudget ?? DEFAULT_SCRIPT_BUDGET;
    await this.options.transaction((txn) =>
      txn.run(
        '',
        { fields: scriptFieldsFromSnapshot(form), event: { kind: 'name-tree-boot' } },
        budget,
      ),
    );
  }

  /** {@link FormScripts.commit} in a transaction of its own. */
  commit(form: FormSnapshot, ref: FormFieldRef, value: FormFieldValue): Promise<FormScriptResult> {
    return this.transaction((scripts) => scripts.commit(form, ref, value));
  }

  /** {@link FormScripts.activate} in a transaction of its own. */
  activate(
    form: FormSnapshot,
    ref: FormFieldRef,
    action: PdfActionTree<unknown>,
  ): Promise<FormScriptResult> {
    return this.transaction((scripts) => scripts.activate(form, ref, action));
  }

  /** {@link FormScripts.recalculate} in a transaction of its own. */
  recalculate(form: FormSnapshot): Promise<FormScriptResult> {
    return this.transaction((scripts) => scripts.recalculate(form));
  }

  private async run(
    txn: ScriptTransaction,
    snapshot: FormSnapshot,
    refInput: FormFieldRef | undefined,
    proposed?: FormFieldValue,
    activation?: PdfActionTree<unknown>,
  ): Promise<FormScriptResult> {
    // Recalculate's anchor resolves here (first live /CO field, else the
    // first field); a zero-field document is an honest no-op.
    const asked =
      refInput ??
      snapshot.calculationOrder.find(
        (candidate): candidate is FormFieldRef =>
          candidate !== null && snapshotField(snapshot, candidate) !== undefined,
      ) ??
      snapshot.fields[0]?.ref;
    if (!asked) {
      return { status: 'accepted', effects: [], bootEffects: [], uiEffects: [], diagnostics: [] };
    }
    const target = snapshotField(snapshot, asked);
    if (!target) {
      return this.failed([], [], scriptError(`Form field '${refKey(asked)}' no longer exists`));
    }
    // The scripts know the field by its own ref, whichever ref asked for it.
    const ref = target.ref;

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
            return this.rejected(bootEffects, uiEffects, diagnostics);
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
            return this.rejected(bootEffects, uiEffects, diagnostics);
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
            return this.rejected(bootEffects, uiEffects, diagnostics);
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
    return { status: 'accepted', effects, bootEffects, uiEffects, diagnostics };
  }

  private failed(
    uiEffects: FormUiEffect[],
    diagnostics: ScriptDiagnostic[],
    error: ScriptExecutionError,
  ): FormScriptResult {
    return { status: 'failed', effects: [], bootEffects: [], uiEffects, diagnostics, error };
  }

  /** The value is refused; the open scripts' effects are still written. */
  private rejected(
    bootEffects: FormEffect[],
    uiEffects: FormUiEffect[],
    diagnostics: ScriptDiagnostic[],
  ): FormScriptResult {
    return { status: 'rejected', effects: [], bootEffects, uiEffects, diagnostics };
  }
}

export function createFormScriptingController(
  options: FormScriptingControllerOptions,
): FormScriptingController {
  return new FormScriptingController(options);
}
