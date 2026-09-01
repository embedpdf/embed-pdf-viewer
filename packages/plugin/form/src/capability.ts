import {
  PermissionDenied,
  type AnnotationRef,
  type FormDataFormat,
  type FormFieldDraft,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldValue,
  type FormSnapshot,
  type PdfActionTargetRef,
  type PdfActionTree,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';
import { DocumentsToken, type PluginContext } from '@embedpdf/core';
import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionOrigin,
  ActionSource,
  ActionSubmitRequest,
  SubmitIntent,
} from '@embedpdf/plugin-actions/contract';

import { buildSubmitEntries, resolveFieldSelection } from './field-selection';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';

import {
  fillItemForWidget as coreFillItemForWidget,
  fillItems as coreFillItems,
  type FillItem,
} from './core/fill-items';
import {
  fieldByKey,
  fieldForWidget as coreFieldForWidget,
  update,
  type Box,
  type FieldKey,
  type Model,
  type Msg,
} from './core/model';
import { createSerialMutationQueue } from './mutationQueue';
import { createFormScriptingController } from './scripting';
import type { FormEffectsResult } from '@embedpdf/engine-core/runtime';
import type {
  FormAction,
  FormCommitResult,
  FormHostCapability,
  FormPluginOptions,
  FormState,
  PlacedField,
  PlaceFieldInput,
  WidgetActivationResult,
} from './types';

/** PDF user-space rect (y-up) → content-space box (y-down, crop-relative). */
const toBox = (rect: PdfRect, crop: PdfRect): Box => ({
  x: rect.left - crop.left,
  y: crop.top - rect.top,
  width: rect.right - rect.left,
  height: rect.top - rect.bottom,
});

const sameAnnotationRef = (left: AnnotationRef, right: AnnotationRef): boolean => {
  if (left.kind !== right.kind || left.pageObjectNumber !== right.pageObjectNumber) return false;
  if (left.kind === 'objectNumber' && right.kind === 'objectNumber') {
    return left.annotObjectNumber === right.annotObjectNumber;
  }
  if (left.kind === 'nm' && right.kind === 'nm') return left.nm === right.nm;
  return (
    left.kind === 'index' &&
    right.kind === 'index' &&
    left.index === right.index &&
    left.revision === right.revision
  );
};

/**
 * The form shell. Pure `update` runs here; the resulting model is dispatched
 * to the store; engine calls happen around it. Every read the frameworks do
 * goes through memoized projections keyed on `model.seq`.
 */
export function createFormCapability(
  ctx: PluginContext<FormState, FormAction>,
  options: FormPluginOptions = {},
): FormHostCapability {
  const model = (): Model => ctx.getState().model;
  const apply = (msg: Msg): void => {
    ctx.dispatch({ type: 'SET_MODEL', model: update(model(), msg) });
  };

  const refKeyOf = (key: FieldKey): FormFieldRef => {
    if (key.startsWith('obj:')) {
      return { kind: 'objectNumber', fieldObjectNumber: Number(key.slice(4)) };
    }
    return { kind: 'fqn', name: key.slice(4) };
  };
  const enqueueMutation = createSerialMutationQueue();

  // Scripting rides the actions plugin's per-document realm: the transaction
  // port's PRESENCE is the "JavaScript is on" signal (D8 — the switch lives
  // on actionsPlugin({ javascript }); form owns only the K/V/C/F pipeline).
  const actionsHost = ctx.tryGet(ActionsHostToken);
  const scriptPort = actionsHost?.scriptTransaction?.bind(actionsHost) ?? null;
  const scripting =
    scriptPort && ctx.doc
      ? createFormScriptingController({
          doc: ctx.doc,
          document: () => ctx.document(),
          transaction: scriptPort,
        })
      : null;
  if (scripting) ctx.cleanup(() => scripting.dispose());

  /** Every script surface (UI effects, diagnostics, errors) flows through
   *  the actions plugin's ONE port — origin/phase attached (D9). */
  const surfaceViaActions = (result: FormCommitResult, origin: ActionOrigin): void => {
    if (!actionsHost) return;
    const phases: Array<'boot' | 'user'> = ['boot', 'user'];
    for (const phase of phases) {
      const uiEffects = result.uiEffects.filter((effect) => effect.phase === phase);
      if (uiEffects.length === 0 && phase === 'boot') continue;
      actionsHost.surfaceScriptResult({
        uiEffects,
        diagnostics: phase === 'user' ? result.diagnostics : [],
        ...(phase === 'user' && result.error ? { error: result.error } : {}),
        origin,
        phase,
      });
    }
  };

  // Authority reads for the twins, the hydration gate, the fused fill
  // projection, and the write gate — one wildcard-aware helper.
  const can = (cap: 'doc.forms.read' | 'doc.forms.fill' | 'doc.forms.modify'): boolean =>
    ctx.doc?.security.allows(cap) ?? false;

  // ── snapshot loading ────────────────────────────────────────────────────
  let refreshPromise: Promise<void> | null = null;
  const refresh = async (force = false): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    // No read authority → don't fire a doomed list (a reviewer-shaped token
    // without `doc.forms.read` is the COMMON narrowed scope); the model stays
    // empty and `canRead()` tells chrome why. The engine enforces regardless.
    if (!can('doc.forms.read')) return;
    if (refreshPromise) {
      await refreshPromise;
      if (!force) return;
    }
    refreshPromise = doc.forms
      .list()
      .then((snapshot) => apply({ t: 'snapshot', snapshot }))
      .catch((err) => {
        // A race with an access change 403s here; anything else is a real
        // load failure. Either way: surfaced, never an unhandled rejection.
        console.warn('[form] form snapshot failed to load', err);
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  };

  // ── widget geometry (from the WIDGET plane: one annotations read/page) ──
  const geomLoading = new Set<number>();
  const ensureGeom = (pon: number): void => {
    const doc = ctx.doc;
    if (!doc || geomLoading.has(pon) || model().geom[pon]) return;
    const crop = ctx.document()?.pages.find((p) => p.pageObjectNumber === pon)?.boxes.crop;
    if (!crop) return;
    geomLoading.add(pon);
    void doc
      .page(pon)
      .annotations.list()
      .then(({ annotations }) => {
        const boxes: Record<number, Box> = {};
        for (const dto of annotations) {
          if (dto.subtype !== 'widget') continue;
          const objectNumber = dto.ref.kind === 'objectNumber' ? dto.ref.annotObjectNumber : 0;
          if (objectNumber > 0) boxes[objectNumber] = toBox(dto.rect, crop);
        }
        apply({ t: 'pageGeom', pageObjectNumber: pon, boxes });
      })
      .finally(() => {
        geomLoading.delete(pon);
      });
  };

  // ── memoized fill projection ────────────────────────────────────────────
  // Session fill authority FUSES into the same `disabled` the field's
  // ReadOnly flag feeds (permissions.md: authority rides the flags gate) —
  // without `doc.forms.fill` every widget renders inert, so the pixels are
  // truthful and no gesture reaches a doomed write.
  const fuseFill = (item: FillItem | null, fillable: boolean): FillItem | null =>
    item === null || fillable || item.disabled ? item : { ...item, disabled: true };

  const fillCache = new Map<number, { seq: number; fillable: boolean; items: FillItem[] }>();
  const fillItems = (pon: number): FillItem[] => {
    const m = model();
    const fillable = can('doc.forms.fill');
    const hit = fillCache.get(pon);
    if (hit && hit.seq === m.seq && hit.fillable === fillable) return hit.items;
    const items = coreFillItems(m, pon).map((item) => fuseFill(item, fillable) as FillItem);
    fillCache.set(pon, { seq: m.seq, fillable, items });
    return items;
  };

  // Single-widget projection — reference-stable per model.seq so framework
  // selectors can use plain identity equality.
  const fillItemCache = new Map<
    number,
    { seq: number; fillable: boolean; item: FillItem | null }
  >();
  const fillItem = (annotObjectNumber: number): FillItem | null => {
    const m = model();
    const fillable = can('doc.forms.fill');
    const hit = fillItemCache.get(annotObjectNumber);
    if (hit && hit.seq === m.seq && hit.fillable === fillable) return hit.item;
    const item = fuseFill(coreFillItemForWidget(m, annotObjectNumber), fillable);
    fillItemCache.set(annotObjectNumber, { seq: m.seq, fillable, item });
    return item;
  };

  // ── typed writes: writeStart → engine → writeDone/writeFailed ──────────
  const commitValueNow = async (
    ref: FormFieldRef,
    value: FormFieldValue,
  ): Promise<FormCommitResult> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('no document');
    if (scripting) {
      const result = await scripting.commit(ref, value);
      surfaceViaActions(result, 'user');
      // A native partial/failed effects result can still have mutated state.
      if (result.effectsResult !== null) await refresh(true);
      return result;
    }

    const result = await doc.forms.setValue(ref, value);
    await refresh(true);
    return {
      status: result.changedWidgets.length > 0 ? 'applied' : 'unchanged',
      scripted: false,
      effectsResult: null,
      uiEffects: [],
      diagnostics: [],
    };
  };

  const write = (key: FieldKey, value: FormFieldValue): Promise<void> => {
    // The optimistic gate: no fill authority → refuse BEFORE the spinner and
    // the queued engine call, with the refusal shape the engine would send.
    // (The fused projection renders such widgets inert; this covers the
    // imperative door.)
    if (!can('doc.forms.fill'))
      return Promise.reject(new PermissionDenied('doc.forms.fill', 'form.fill'));
    return enqueueMutation(async () => {
      const doc = ctx.doc;
      if (!doc) return;
      apply({ t: 'writeStart', key });
      try {
        const result = await commitValueNow(refKeyOf(key), value);
        if (result.status === 'rejected' || result.status === 'failed') {
          apply({ t: 'writeFailed', key });
        } else if (result.effectsResult === null && result.scripted) {
          // A scripted no-op has no engine read-back to clear the spinner.
          apply({ t: 'writeFailed', key });
        }
      } catch (err) {
        apply({ t: 'writeFailed', key });
        throw err;
      }
    });
  };

  // ── design mode ──────────────────────────────────────────────────────────
  // The annotation plane must re-read pages whose widget population changed
  // underneath it (created/deleted widgets); optional — fill-only setups
  // simply have no annotation plugin to nudge.
  const annotationHost = ctx.tryGet(AnnotationHostToken);

  const annotationActivation = async (ref: AnnotationRef) => {
    const doc = ctx.doc;
    if (!doc) return null;
    const loaded = annotationHost?.get(ref);
    if (loaded?.subtype === 'widget') return loaded.actions?.activate ?? null;
    const { annotations } = await doc.page(ref.pageObjectNumber).annotations.list();
    const annotation = annotations.find((candidate) => sameAnnotationRef(candidate.ref, ref));
    return annotation?.subtype === 'widget' ? (annotation.actions?.activate ?? null) : null;
  };

  const activateWidgetNow = async (
    key: FieldKey,
    annotationRef: AnnotationRef,
  ): Promise<FormCommitResult> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('no document');
    if (!scripting) {
      return {
        status: 'unchanged',
        scripted: false,
        effectsResult: null,
        uiEffects: [],
        diagnostics: [],
      };
    }
    const action = await annotationActivation(annotationRef);
    if (!action) {
      return {
        status: 'unchanged',
        scripted: true,
        effectsResult: null,
        uiEffects: [],
        diagnostics: [],
      };
    }
    const result = await scripting.activate(refKeyOf(key), action);
    surfaceViaActions(result, 'user');
    if (result.effectsResult !== null) await refresh(true);
    return result;
  };

  // ── action-executor doors (host lens) ───────────────────────────────────
  // Both ride enqueueMutation: an actions-driven form mutation must never
  // interleave with a user's in-flight commit. The direction is always
  // actions queue → form queue — the delegated activateWidget below never
  // enters the form queue, so these can (no self-deadlock).

  const NOT_SCRIPTED: FormCommitResult = {
    status: 'unchanged',
    scripted: false,
    effectsResult: null,
    uiEffects: [],
    diagnostics: [],
  };

  /**
   * The shared reset core: one effects batch → refresh → V/C/F
   * recalculation when the transaction port is present. Ridden by BOTH
   * doors — the /ResetForm executor and the public `reset(key)` — so the
   * two can never diverge again (the "reset() asymmetry" fix). `origin` is
   * PRESERVED through recalculation surfacing: a lifecycle/hover ResetForm
   * can no longer launder its alerts into user origin.
   */
  const applyResetBatch = async (
    refs: FormFieldRef[],
    origin: ActionOrigin,
  ): Promise<FormCommitResult> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('no document');
    if (!doc.forms.applyEffects) {
      const result: FormCommitResult = {
        ...NOT_SCRIPTED,
        diagnostics: [
          { code: 'unsupported-api', message: 'this engine has no form-effects batch door' },
        ],
      };
      surfaceViaActions(result, origin);
      return result;
    }
    // Zero refs must NEVER reach the engine (the applier throws InvalidArg
    // on an empty reset) — `[] + include` is a valid action that resets
    // nothing. `effectsResult: null` tells the executor this was inert.
    if (refs.length === 0) return NOT_SCRIPTED;
    const effectsResult = await doc.forms.applyEffects([{ kind: 'reset', refs }]);
    // The batch is non-rollback-atomic and resolves with per-effect
    // statuses instead of throwing — reflect a rejected/failed reset
    // honestly (the executor maps 'failed' to a failed chain node).
    const resetFailed = effectsResult.results.some(
      (entry) => entry.status === 'failed' || entry.status === 'rejected',
    );
    await refresh(true);
    if (resetFailed) {
      return {
        status: 'failed',
        scripted: false,
        effectsResult,
        uiEffects: [],
        diagnostics: [],
      };
    }
    // Acrobat recalculates after a reset; boot rides along lazily.
    let recalc: FormCommitResult | null = null;
    if (scripting) {
      recalc = await scripting.recalculate();
      surfaceViaActions(recalc, origin);
      if (recalc.effectsResult !== null) await refresh(true);
    }
    return {
      status: 'applied',
      scripted: recalc !== null,
      effectsResult,
      uiEffects: recalc?.uiEffects ?? [],
      diagnostics: recalc?.diagnostics ?? [],
      ...(recalc?.error ? { error: recalc.error } : {}),
    };
  };

  const resetFormAction = (
    targets: PdfActionTargetRef[] | null,
    exclude: boolean,
    origin: ActionOrigin = 'user',
  ): Promise<FormCommitResult> =>
    enqueueMutation(async () => {
      const doc = ctx.doc;
      if (!doc) throw new Error('no document');
      const snapshot = await doc.forms.list();
      // The shared ISO selection (Tables 241/242): a parent NAME resets its
      // descendants too — the exact-match resolution this replaces was a
      // conformance bug.
      const { selected } = resolveFieldSelection(snapshot.fields, targets, exclude);
      // ResetForm SKIPS fields with nothing to restore — the engine's batch
      // applier refuses pushbutton/signature refs outright (validateEffect),
      // and an exclude-mode complement always sweeps in the form's buttons.
      const resettable = selected.filter(
        (f) => f.family !== 'pushbutton' && f.family !== 'signature',
      );
      return applyResetBatch(
        resettable.map((f) => f.ref),
        origin,
      );
    });

  /**
   * The submit dataset resolver (Phase 4, D7): a FRESH engine read — never
   * the cached model, so no staleness class exists — then the pure ISO
   * builder. Selection/veto/value semantics live in `field-selection.ts`;
   * this door only supplies the live fields and assembles the request.
   */
  const resolveSubmitDataset = async (
    intent: SubmitIntent,
    actionCtx: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('no document');
    const snapshot = await doc.forms.list();
    return {
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      ...(intent.charSet === undefined ? {} : { charSet: intent.charSet }),
      entries: buildSubmitEntries(snapshot.fields, intent, diagnose),
      origin: actionCtx.origin,
      event: actionCtx.event,
    };
  };

  // ── widget DOM-event feed helpers ───────────────────────────────────────
  const widgetSource = (key: FieldKey, annotationRef: AnnotationRef): ActionSource => ({
    kind: 'widget',
    field: refKeyOf(key),
    annotation: annotationRef,
    pon: annotationRef.pageObjectNumber,
  });

  /** One shared hover pump (Exit→Enter as one ordered pair; intermediates
   *  skipped), created on first use against the resolved actions capability. */
  let widgetPump: ReturnType<typeof createHoverPump> | null = null;
  const widgetHoverPump = (actions: {
    dispatch: Parameters<typeof createHoverPump>[0];
  }): ReturnType<typeof createHoverPump> => {
    widgetPump ??= createHoverPump(actions.dispatch);
    return widgetPump;
  };

  const widgetHoverFlags = (
    annotationRef: AnnotationRef,
  ): { enter: boolean; exit: boolean } | null => {
    const loaded = annotationHost?.get(annotationRef);
    if (loaded?.subtype !== 'widget') return null;
    return {
      enter: Boolean(loaded.actions?.cursorEnter?.root),
      exit: Boolean(loaded.actions?.cursorExit?.root),
    };
  };

  const nudgeAnnotations = (pons: Iterable<number>): void => {
    if (!annotationHost) return;
    for (const pon of new Set(pons)) void annotationHost.reloadPage(pon);
  };

  /** Content-space box → PDF rect (inverse of `toBox`). */
  const toPdfRect = (
    box: { x: number; y: number; width: number; height: number },
    crop: PdfRect,
  ): PdfRect => ({
    left: box.x + crop.left,
    top: crop.top - box.y,
    right: box.x + crop.left + box.width,
    bottom: crop.top - box.y - box.height,
  });

  /** The page's content box (`{0,0,w,h}`), for page-bound placement math. */
  const pageBox = (pon: number): Box | null => {
    const crop = ctx.document()?.pages.find((p) => p.pageObjectNumber === pon)?.boxes.crop;
    return crop
      ? { x: 0, y: 0, width: crop.right - crop.left, height: crop.top - crop.bottom }
      : null;
  };

  /** Deterministic, collision-free auto-name: `text_1`, `text_2`, … counted
   *  against the CURRENT snapshot (rename in the field panel). */
  const autoName = (family: string): string => {
    const names = new Set((model().snapshot?.fields ?? []).map((f) => f.name));
    let n = 1;
    while (names.has(`${family}_${n}`)) n++;
    return `${family}_${n}`;
  };

  const placeFieldNow = async (input: PlaceFieldInput): Promise<PlacedField> => {
    const doc = ctx.doc;
    const pon = input.pageObjectNumber;
    const crop = ctx.document()?.pages.find((p) => p.pageObjectNumber === pon)?.boxes.crop;
    if (!doc || !crop) throw new Error('[form] placeField: document/page not ready');
    // Placement is page-bound: intersect a (possibly overshooting) drag box
    // with the page. Sizing policy is the CALLER's job (the place handler's
    // click policy / drag rect) — a degenerate result is a caller bug.
    const page = pageBox(pon)!;
    const x = Math.max(page.x, Math.min(input.box.x, page.width));
    const y = Math.max(page.y, Math.min(input.box.y, page.height));
    const box: Box = {
      x,
      y,
      width: Math.max(0, Math.min(input.box.x + input.box.width, page.width) - x),
      height: Math.max(0, Math.min(input.box.y + input.box.height, page.height) - y),
    };
    if (box.width < 1 || box.height < 1) {
      throw new Error('[form] placeField: degenerate box (size the box before placing)');
    }
    const { family, appearance } = input;
    const name = autoName(family);
    const placement = {
      pageObjectNumber: pon,
      rect: toPdfRect(box, crop),
      ...(appearance ? { appearance } : {}),
    };
    const draft: FormFieldDraft =
      family === 'radio'
        ? { family, name, widgets: [{ ...placement, onState: 'option1' }] }
        : family === 'combobox' || family === 'listbox'
          ? {
              family,
              name,
              widget: placement,
              options: [
                { label: 'Option 1', value: 'Option 1' },
                { label: 'Option 2', value: 'Option 2' },
              ],
            }
          : { family, name, widget: placement };
    const result = await doc.forms.createField(draft);
    await refresh(true);
    apply({ t: 'clearGeom', pageObjectNumber: pon });
    // AWAIT the annotation-plane reload so the returned widget ref is already
    // selectable — the caller's auto-select needs the model to know it.
    if (annotationHost) await annotationHost.reloadPage(pon);
    const widget = result.field.widgets.find((w) => w.pageObjectNumber === pon) ?? null;
    return { field: result.field, widget };
  };

  const updateFieldNow = async (key: FieldKey, patch: FormFieldPatch): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    await doc.forms.updateField(refKeyOf(key), patch);
    await refresh(true);
  };

  const deleteFieldNow = async (key: FieldKey): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    const field = fieldByKey(model(), key);
    const pons = field?.widgets.map((w) => w.pageObjectNumber).filter((p) => p > 0) ?? [];
    await doc.forms.deleteField(refKeyOf(key));
    await refresh(true);
    for (const pon of new Set(pons)) apply({ t: 'clearGeom', pageObjectNumber: pon });
    nudgeAnnotations(pons);
  };

  const detachWidgetNow = async (key: FieldKey, annotObjectNumber: number): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    const field = fieldByKey(model(), key);
    const widget = field?.widgets.find((w) => w.annotObjectNumber === annotObjectNumber);
    await doc.forms.detachWidget(refKeyOf(key), {
      annotObjectNumber,
      pageObjectNumber: widget?.pageObjectNumber ?? 0,
    });
    await refresh(true);
    if (widget && widget.pageObjectNumber > 0) {
      apply({ t: 'clearGeom', pageObjectNumber: widget.pageObjectNumber });
      nudgeAnnotations([widget.pageObjectNumber]);
    }
  };

  void refresh();

  return {
    snapshot: () => model().snapshot,
    refresh,
    fillItems,
    fillItem,
    ensureGeom,
    field: (key) => fieldByKey(model(), key),
    fieldForWidget: (annotObjectNumber) => coreFieldForWidget(model(), annotObjectNumber),
    setText: (key, value) => write(key, { type: 'text', value }),
    toggle: (key, onState) => write(key, { type: 'toggle', state: onState }),
    choose: (key, values) => write(key, { type: 'choice', values }),
    reset: (key) => {
      // Reset writes a value (the default) — same optimistic gate as write().
      if (!can('doc.forms.fill'))
        return Promise.reject(new PermissionDenied('doc.forms.fill', 'form.reset'));
      return enqueueMutation(async () => {
        const doc = ctx.doc;
        if (!doc) return;
        apply({ t: 'writeStart', key });
        try {
          if (doc.forms.applyEffects) {
            // The reset() SYMMETRY fix: this door now rides the SAME core a
            // /ResetForm action does — one reset effect, then V/C/F
            // recalculation — so a dependent /C total can never go stale
            // through the public API while staying fresh through the action.
            const result = await applyResetBatch([refKeyOf(key)], 'user');
            if (result.status === 'failed') {
              throw new Error(
                result.effectsResult?.results.find(
                  (entry) => entry.status === 'failed' || entry.status === 'rejected',
                )?.error?.message ?? 'reset failed',
              );
            }
            const field = fieldByKey(model(), key);
            if (field) apply({ t: 'writeDone', key, field });
            else apply({ t: 'writeFailed', key });
          } else {
            // Batch-less engines keep the direct single-field door.
            const result = await doc.forms.reset(refKeyOf(key));
            apply({ t: 'writeDone', key, field: result.field });
          }
        } catch (err) {
          apply({ t: 'writeFailed', key });
          throw err;
        }
      });
    },
    commitValue: (ref, value) => enqueueMutation(() => commitValueNow(ref, value)),
    activateWidget: async (key, annotationRef): Promise<WidgetActivationResult> => {
      // Delegated path: the ACTIONS queue is the serializer — entering the
      // form queue here would deadlock the executors it calls back into
      // (queue-direction law: actions → form, never form → actions → form).
      // No scripting gate on purpose: Hide/ResetForm buttons must work with
      // JS off — per-type policy lives in the dispatcher now. Submission is
      // SYNCHRONOUS (no pre-resolution await): a mouseUp notified just
      // before this takes the earlier queue slot, always.
      const actions = ctx.tryGet(ActionsToken);
      if (actions) {
        const result = await actions.dispatch({
          scope: 'activate',
          ref: annotationRef,
          pon: annotationRef.pageObjectNumber,
          source: widgetSource(key, annotationRef),
        });
        // inert + zero steps + zero diagnostics = no /A tree at all — only
        // then does the legacy form path apply (byte-for-byte no-actions
        // behavior); anything else IS the dispatch outcome, refusals included.
        const noTree =
          result.status === 'inert' &&
          result.steps.length === 0 &&
          result.diagnostics.length === 0;
        if (!noTree) return { kind: 'dispatched', result };
      }
      return {
        kind: 'form',
        result: await enqueueMutation(() => activateWidgetNow(key, annotationRef)),
      };
    },
    notifyWidgetEvent: (key, annotationRef, event) => {
      const actions = ctx.tryGet(ActionsToken);
      if (!actions) return;
      const source = widgetSource(key, annotationRef);
      if (event === 'cursorEnter' || event === 'cursorExit') {
        if (event === 'cursorExit') {
          widgetHoverPump(actions).hover(null);
          return;
        }
        // Tree-presence pre-check through the folded annotation model when
        // available — tree-less hover costs zero dispatches. Without the
        // annotation plugin the flags stay unknown and the dispatcher
        // resolves authoritatively in-queue.
        const flags = widgetHoverFlags(annotationRef);
        if (flags && !flags.enter && !flags.exit) return;
        widgetHoverPump(actions).hover({
          ref: annotationRef,
          pon: annotationRef.pageObjectNumber,
          source,
          ...(flags ? { events: flags } : {}),
        });
        return;
      }
      // D/U/Fo/Bl: direct fire-and-forget — dispatch never rejects, the
      // queue orders, results surface via the actions events. /A-shadowing
      // of U (ISO Table 197) is enforced centrally by the dispatcher.
      void actions.dispatch({
        scope: 'annotation',
        event,
        ref: annotationRef,
        pon: annotationRef.pageObjectNumber,
        source,
      });
    },
    // Host lens (the actions plugin's executors/sinks) — FormHostCapability.
    resetFormAction,
    resolveSubmitDataset,
    commitScriptFormEffects: async (effects) => {
      const doc = ctx.doc;
      if (!doc?.forms.applyEffects) {
        // Sink contract: never throw — shape an all-failed batch honestly.
        return {
          results: effects.map((_, index) => ({
            index,
            status: 'failed' as const,
            fields: [],
            changedWidgets: [],
            error: { code: 'NotSupported', message: 'no form-effects batch door' } as never,
          })),
          changedWidgets: [],
          meta: null,
        };
      }
      let result: FormEffectsResult;
      try {
        result = await doc.forms.applyEffects(effects);
      } catch (error) {
        // Sink contract: never throw. An authority pre-check rejection
        // (PermissionDenied) becomes an all-failed batch, honestly.
        const message = error instanceof Error ? error.message : String(error);
        return {
          results: effects.map((_, index) => ({
            index,
            status: 'failed' as const,
            fields: [],
            changedWidgets: [],
            error: { code: 'Refused', message } as never,
          })),
          changedWidgets: [],
          meta: null,
        };
      }
      // Reconcile OUR model — the owner folds its own writes (the effects
      // listener deliberately ignores local events) — and the ANNOTATION
      // plane's view of any changed widgets (setDisplay flips widget /F
      // bits, and widget pixels live on that plane).
      await refresh(true);
      if (annotationHost) {
        const pons = new Set(
          result.changedWidgets
            .map((widget) => widget.pageObjectNumber)
            .filter((pon) => pon > 0),
        );
        for (const pon of pons) await annotationHost.reloadPage(pon);
      }
      return result;
    },
    setValue: (ref, value) =>
      enqueueMutation(async () => {
        const doc = ctx.doc;
        if (!doc) throw new Error('no document');
        const result = await doc.forms.setValue(ref, value);
        await refresh(true);
        return result;
      }),
    exportData: async (format: FormDataFormat = 'xfdf') => {
      const doc = ctx.doc;
      if (!doc) throw new Error('no document');
      return doc.forms.exportData(format);
    },
    importData: (data, format) =>
      enqueueMutation(async () => {
        const doc = ctx.doc;
        if (!doc) throw new Error('no document');
        const result = await doc.forms.importData(data, format);
        apply({ t: 'snapshot', snapshot: result.snapshot });
        return result;
      }),
    repair: (repairOptions) =>
      enqueueMutation(async () => {
        const doc = ctx.doc;
        if (!doc) throw new Error('no document');
        const result = await doc.forms.repair(repairOptions);
        await refresh(true);
        return result;
      }),
    placeField: (input) => enqueueMutation(() => placeFieldNow(input)),
    pageBox,
    updateField: (key, patch) => enqueueMutation(() => updateFieldNow(key, patch)),
    deleteField: (key) => enqueueMutation(() => deleteFieldNow(key)),
    detachWidget: (key, annotObjectNumber) =>
      enqueueMutation(() => detachWidgetNow(key, annotObjectNumber)),
    // The twins (permissions.md). `canRead` mirrors the hydration gate above
    // — false means the model stays empty by RIGHT, not by loading. Fill and
    // design are independent grants: a filler is not a designer.
    canRead: () => can('doc.forms.read'),
    canFill: () => can('doc.forms.fill'),
    canDesign: () => can('doc.forms.modify'),
  };
}
