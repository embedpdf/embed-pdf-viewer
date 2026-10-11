/**
 * Filling the form in. Every fill is one change, whatever started it: a value, a batch of
 * values, a reset, a widget's activation, a script's or an action's effects.
 *
 *   1. What the user did shows at once: the change is held with the user's own ops.
 *   2. When its turn comes, the form's scripts run against the view, in one realm transaction.
 *   3. Inside that transaction the change gets every op the scripts asked for, and is sent.
 *
 * Fills take turns up to their send, not their answer: the next fill's scripts read this one in
 * the view while the engine answers it. A validation refusal cancels the change. A change the
 * engine refuses leaves the view, and the calculations run again against what is left, outside
 * the history: the fills after it were calculated with its values.
 */
import {
  PluginError,
  toPluginError,
  type ChangeLabel,
  type HeldChange,
  type OperationOptions,
  type PendingChange,
} from '@embedpdf/core';
import {
  fieldValueOf,
  formEffectOps,
  type ChangeOp,
  type FormFieldDTO,
  type FormFieldRef,
  type FormFieldValue,
  type PdfActionTree,
} from '@embedpdf/engine-core/runtime';
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult } from '../contract';
import {
  fieldByKey,
  fieldKeyOf,
  fieldsNamedBy,
  predictFormOp,
  restoresOf,
  withFieldsFrom,
  type FieldIndex,
} from '../model';
import type { FormScriptResult, FormScripts } from '../scripting/controller';
import { scriptError } from '../scripting/results';
import type { FormContext, FormServices } from '../services';

/** The scripts a fill runs before it is sent, when the document's scripts run. */
export type FillScripts =
  /** A field's new value through its own scripts, then the calculations: they make the change. */
  | { readonly kind: 'commit'; readonly field: FormFieldRef; readonly value: FormFieldValue }
  /** A widget's activation action: what it changes is the change. */
  | {
      readonly kind: 'activate';
      readonly field: FormFieldRef;
      readonly action: PdfActionTree<unknown>;
    }
  /** The calculations the user's ops cause: what they change follows the user's ops. */
  | { readonly kind: 'recalculate' };

export interface FillRequest {
  /** What the change is called; a fill of the fields its ops name when left out. */
  readonly label?: ChangeLabel;
  /** What the user did: shown at once. */
  readonly ops: readonly ChangeOp[];
  readonly scripts: FillScripts | null;
  /** Who started it, for the alerts its scripts raise. */
  readonly origin: ActionOrigin;
}

/** How a fill ended, once the engine answered. */
export interface FillOutcome {
  readonly result: FormCommitResult;
  /** The form before the fill, as the view showed it. */
  readonly before: FieldIndex;
  /** The form once the fill had all its ops, as the view showed it. */
  readonly after: FieldIndex;
}

/** A fill shown, waiting for its turn. */
interface Begun {
  readonly request: FillRequest;
  /** The form before the user's ops showed. */
  readonly before: FieldIndex;
  /** The form as the user's ops showed it. */
  readonly shown: FieldIndex;
  readonly hold: HeldChange | null;
}

/** A fill sent, waiting for the engine. */
interface Sent {
  readonly script: FormScriptResult | null;
  /** The changes it was sent as: one, or two when the hold went before the scripts finished. */
  readonly changes: readonly PendingChange[];
  readonly after: FieldIndex;
}

/** A refused value writes only what the document's open scripts did, outside the history. */
const SCRIPTS_LABEL: ChangeLabel = { key: 'form.scripts' };
/** The calculations again, outside the history: after a refused fill, or a stale one. */
const RECALCULATE_LABEL: ChangeLabel = { key: 'form.recalculate' };
/** The changes that, refused, leave calculations made with their values. */
const FILLS = new Set(['form.fill', 'form.reset']);

const sameOp = (left: ChangeOp, right: ChangeOp): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const sameValue = (left: FormFieldDTO | null, right: FormFieldDTO | null): boolean =>
  JSON.stringify(left?.valueEntry ?? null) === JSON.stringify(right?.valueEntry ?? null);

export function createFill(
  ctx: FormContext,
  { fields, scripting, enqueue }: Pick<FormServices, 'fields' | 'scripting' | 'enqueue'>,
) {
  const labelOf = (request: FillRequest, index: FieldIndex, ops: readonly ChangeOp[]) =>
    request.label ?? { key: 'form.fill', count: fieldsNamedBy(index, ops).length };

  /** Step 1: what the user did shows at once. */
  const begin = (request: FillRequest): Begun => {
    const before = fields.view();
    const shown = request.ops.reduce(predictFormOp, before);
    if (request.ops.length === 0) return { request, before, shown, hold: null };
    const hold = ctx.changes.hold(labelOf(request, before, request.ops));
    hold.set(request.ops, restoresOf(before, request.ops));
    return { request, before, shown, hold };
  };

  /**
   * The form the change is undone to: as it is now, with the user's own fields as they were
   * before the user's ops showed.
   */
  const baseOf = ({ request, before }: Begun): FieldIndex =>
    withFieldsFrom(fields.view(), before, fieldsNamedBy(before, request.ops));

  /** Whether the hold went with the user's ops before the scripts finished. */
  const sentEarly = ({ hold }: Begun): boolean => hold !== null && !hold.open && !!hold.change;

  /** Whether the form still shows the values the user's ops wrote: the scripts ran for those. */
  const stillShown = ({ request, shown }: Begun): boolean => {
    const now = fields.view();
    return fieldsNamedBy(shown, request.ops).every((field) =>
      sameValue(fieldByKey(now, fieldKeyOf(field)), field),
    );
  };

  /** Step 3: the change with all its ops, sent. */
  const send = (begun: Begun, ops: readonly ChangeOp[], script: FormScriptResult | null): Sent => {
    const { request, hold } = begun;
    if (ops.length === 0) {
      hold?.cancel();
      return { script, changes: [], after: fields.view() };
    }
    if (!hold) {
      const label = labelOf(request, fields.view(), ops);
      const change = ctx.changes.stage({ label, ops, undo: restoresOf(baseOf(begun), ops) });
      return { script, changes: [change], after: fields.view() };
    }
    if (hold.open) {
      hold.set(ops, restoresOf(baseOf(begun), ops));
      const change = hold.send();
      return { script, changes: change ? [change] : [], after: fields.view() };
    }
    // Something sent the hold with the user's ops while the scripts ran (another plugin's
    // change, a download): the rest is a change of its own.
    const sent = hold.change;
    const rest = ops.filter((op) => !sent?.shows.some((shown) => sameOp(shown as ChangeOp, op)));
    const changes = sent ? [sent] : [];
    if (rest.length > 0) {
      const label = labelOf(request, fields.view(), rest);
      changes.push(ctx.changes.stage({ label, ops: rest, undo: restoresOf(fields.view(), rest) }));
    }
    return { script, changes, after: fields.view() };
  };

  /** The user's ops went on their own and the scripts refused them: their fields are written back. */
  const takeBack = ({ request, before }: Begun): void => {
    const ops = fieldsNamedBy(before, request.ops).flatMap((field): ChangeOp[] => {
      const value = fieldValueOf(field);
      return value ? [{ type: 'forms.setValue', field: field.ref, value }] : [];
    });
    if (ops.length === 0) return;
    ctx.changes.stage({ label: labelOf(request, before, ops), ops, history: false });
  };

  /** The calculations again, against what the form shows now: one change, outside the history. */
  const recalculateNow = async (scripts: FormScripts, origin: ActionOrigin): Promise<void> => {
    const shown = fields.view().snapshot;
    if (!shown) return;
    const script = await scripts.recalculate(shown);
    scripting.surface(script, origin);
    if (script.status !== 'accepted' || script.effects.length === 0) return;
    ctx.changes.stage({
      label: RECALCULATE_LABEL,
      ops: formEffectOps(script.effects),
      history: false,
    });
  };

  /** Step 2: the scripts, against the view. */
  const runScripts = (
    scripts: FormScripts,
    begun: Begun,
    plan: FillScripts,
  ): Promise<FormScriptResult> | null => {
    const shown = fields.view().snapshot;
    if (!shown) return null;
    switch (plan.kind) {
      case 'commit': {
        // The value's own scripts read the form without it.
        const form = baseOf(begun).snapshot ?? shown;
        return scripts.commit(form, plan.field, plan.value);
      }
      case 'activate':
        return scripts.activate(shown, plan.field, plan.action);
      case 'recalculate':
        return scripts.recalculate(shown);
    }
  };

  /** Steps 2 and 3, when the fill's turn comes. */
  const finish = async (begun: Begun): Promise<Sent> => {
    const { request, hold } = begun;
    const plan = request.scripts;
    // A widget's action runs its own script; a value's scripts are the form's fields'.
    const pipeline = !plan
      ? null
      : plan.kind === 'activate'
        ? scripting.controller()
        : scripting.scriptsFor(fields.view());
    if (!plan || !pipeline) return send(begun, request.ops, null);
    if (!fields.view().snapshot) await fields.settled();
    try {
      // The ops are set inside the realm transaction: the next one reads the form with them.
      return await pipeline.transaction(async (scripts) => {
        const running = runScripts(scripts, begun, plan);
        if (!running) return send(begun, request.ops, null);
        const script = await running;
        scripting.surface(script, request.origin);
        const early = sentEarly(begun);
        if (script.status !== 'accepted') {
          hold?.cancel();
          if (early) takeBack(begun);
          if (script.status === 'rejected' && script.bootEffects.length > 0) {
            ctx.changes.stage({
              label: SCRIPTS_LABEL,
              ops: formEffectOps(script.bootEffects),
              history: false,
            });
          }
          return { script, changes: [], after: fields.view() };
        }
        if (early && !stillShown(begun)) {
          // The form shows other values for the user's fields now (an undo, a later fill): what
          // the scripts made of the user's values is stale, and the calculations run again.
          await recalculateNow(scripts, request.origin);
          return { script, changes: [hold!.change!], after: fields.view() };
        }
        const effects = formEffectOps(script.effects);
        return send(
          begun,
          plan.kind === 'recalculate' ? [...request.ops, ...effects] : effects,
          script,
        );
      });
    } catch (error) {
      hold?.cancel();
      throw error;
    }
  };

  /** What a sent fill did, once the engine answered. */
  const answered = async (begun: Begun, sent: Sent): Promise<FillOutcome> => {
    const { script } = sent;
    const scripted = script !== null;
    const reported = {
      scripted,
      uiEffects: script?.uiEffects ?? [],
      diagnostics: script?.diagnostics ?? [],
      ...(script?.error ? { error: script.error } : {}),
    };
    const outcome = (status: FormCommitResult['status']): FillOutcome => ({
      result: { status, ...reported },
      before: begun.before,
      after: sent.after,
    });
    if (script?.status === 'failed') return outcome('failed');
    if (script?.status === 'rejected') return outcome('rejected');
    let undoable = false;
    for (const change of sent.changes) {
      try {
        undoable = (await change.result).meta.undoable || undoable;
      } catch (error) {
        throw toPluginError('form', error);
      }
    }
    return outcome(undoable ? 'applied' : 'unchanged');
  };

  /**
   * Fill the form in: shown at once, sent when its turn comes; resolves once the engine
   * answered. A change the engine refuses rejects.
   */
  const fill = async (request: FillRequest, options?: OperationOptions): Promise<FillOutcome> => {
    const begun = begin(request);
    let sent: Sent;
    try {
      sent = await enqueue(() => finish(begun), options);
    } catch (error) {
      begun.hold?.cancel();
      throw toPluginError('form', error);
    }
    return ctx.cancellable(options?.signal, answered(begun, sent));
  };

  /**
   * Fill the form in without waiting: what a script's effects need, written while its own
   * transaction still runs. A failure is reported as the scripts' error.
   */
  const fillSoon = (request: FillRequest): void => {
    const begun = begin(request);
    void enqueue(() => finish(begun)).catch((error: unknown) => {
      begun.hold?.cancel();
      const message = toPluginError('form', error).message;
      scripting.surface(
        { uiEffects: [], diagnostics: [], error: scriptError(message) },
        request.origin,
      );
    });
  };

  // A fill the engine refused leaves the view, and the fills after it were calculated with its
  // values: the calculations run again against what is left.
  let recalculating = false;
  const recalculate = (): Promise<void> =>
    enqueue(async () => {
      recalculating = false;
      const pipeline = scripting.controller();
      if (pipeline) await pipeline.transaction((scripts) => recalculateNow(scripts, 'user'));
    });
  ctx.changes.onSettled((settled) => {
    if (settled.status !== 'refused' || settled.change.undoOf !== null) return;
    if (!FILLS.has(settled.change.label.key) || recalculating) return;
    const order = fields.view().snapshot?.calculationOrder ?? [];
    if (!scripting.controller() || !order.some((ref) => ref !== null)) return;
    recalculating = true;
    void recalculate().catch(() => {
      /* the scripts' failure is surfaced; a refused recalculation is reported by the queue */
    });
  });

  // A download waits for the fills on their way, and for the engine's answers to them.
  ctx.onSettle(async () => {
    await enqueue.idle();
    await ctx.changes.whenSettled();
  });

  return { fill, fillSoon };
}

export type Fills = ReturnType<typeof createFill>;

/** A fill that failed in the form's own scripts, as the verbs report it. */
export function failedFill(result: FormCommitResult): PluginError {
  return new PluginError(
    'operation-failed',
    'form',
    result.error?.message ?? result.diagnostics[0]?.message ?? 'the write failed',
  );
}
