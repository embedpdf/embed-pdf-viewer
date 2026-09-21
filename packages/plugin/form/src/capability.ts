import {
  PermissionDenied,
  pageRefsEqual,
  type AnnotationRef,
  type FormDataFormat,
  type FormFieldDTO,
  type FormFieldDraft,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldValue,
  type FormSnapshot,
  type PageRef,
  type PdfActionTargetRef,
  type PdfActionTree,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';
import {
  DocumentsToken,
  PluginError,
  createEventHook,
  originOf,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type ChangeOrigin,
  type DocumentEvent,
  type PluginContext,
  type ResourceStatus,
} from '@embedpdf/core';
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
  widgetAt as coreWidgetAt,
  type Box,
  type FieldKey,
  type Model,
  type Msg,
  type WidgetHit,
} from './core/model';
import { createSerialMutationQueue } from './mutationQueue';
import { createFormScriptingController } from './scripting';
import type { FormEffectsResult } from '@embedpdf/engine-core/runtime';
import type {
  CreatedField,
  CreateFieldInput,
  FormAction,
  FormCommitResult,
  FormConfig,
  FormFieldChangedEvent,
  FormFilter,
  FormHostCapability,
  FormResyncedEvent,
  FormState,
  FormValidationRejectedEvent,
  FormValueChangedEvent,
  SetValueResult,
  WidgetActivationResult,
  WidgetAddress,
} from './types';
import { update as updateModel } from './core/model';

/** PDF user-space rect (y-up) → content-space box (y-down, crop-relative). */
const toBox = (rect: PdfRect, crop: PdfRect): Box => ({
  x: rect.left - crop.left,
  y: crop.top - rect.top,
  width: rect.right - rect.left,
  height: rect.top - rect.bottom,
});

const sameAnnotationRef = (left: AnnotationRef, right: AnnotationRef): boolean => {
  if (left.kind !== right.kind || !pageRefsEqual(left.page, right.page)) return false;
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
/** The capability alone, connected at once — the shape the unit tests build. */
export function createFormCapability(
  ctx: PluginContext<FormState, FormAction>,
  config: FormConfig = {},
): FormHostCapability {
  const { api, connect } = createFormController(ctx, config);
  connect();
  return api;
}

/**
 * The form controller. The model holds the reconciled field tree, the
 * per-page widget geometry and the in-flight writes; every engine read lands
 * through `readSnapshot`, every confirmed field change is announced from the
 * document event stream in `connect` (own, script and remote writes alike).
 */
export function createFormController(
  ctx: PluginContext<FormState, FormAction>,
  config: FormConfig = {},
) {
  const model = (): Model => ctx.getState().model;
  const keyOf = (ref: FormFieldRef): FieldKey =>
    ref.kind === 'objectNumber' ? `obj:${ref.fieldObjectNumber}` : `fqn:${ref.name}`;
  const reportListener = (error: unknown) => console.error('[form] event listener failed:', error);
  const valueChanged = createEventHook<FormValueChangedEvent>(reportListener);
  const fieldCreated = createEventHook<FormFieldChangedEvent>(reportListener);
  const fieldUpdated = createEventHook<FormFieldChangedEvent>(reportListener);
  const fieldDeleted = createEventHook<FormFieldChangedEvent>(reportListener);
  const validationRejected = createEventHook<FormValidationRejectedEvent>(reportListener);
  const resynced = createEventHook<FormResyncedEvent>(reportListener);
  ctx.cleanup(() => {
    for (const hook of [
      valueChanged,
      fieldCreated,
      fieldUpdated,
      fieldDeleted,
      validationRejected,
      resynced,
    ])
      hook.dispose();
  });
  const setStatus = (status: ResourceStatus): void => {
    if (ctx.getState().status !== status) ctx.dispatch({ type: 'SET_STATUS', status });
  };
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
  const realm = actionsHost?.scriptRealm ?? null;
  const scripting =
    realm && ctx.doc && config.validation !== 'none'
      ? createFormScriptingController({
          doc: ctx.doc,
          document: () => ctx.document(),
          transaction: realm.transaction.bind(realm),
          budget: realm.budget,
        })
      : null;
  if (scripting) ctx.cleanup(() => scripting.dispose());

  /** Every script surface (UI effects, diagnostics, errors) flows through
   *  the actions plugin's ONE port — origin/phase attached (D9). */
  const surfaceViaActions = (result: FormCommitResult, origin: ActionOrigin): void => {
    actionsHost?.surfaceScriptCommit(result, { origin, realm: 'document' });
  };

  // Authority reads for the twins, the hydration gate, the fused fill
  // projection, and the write gate — one wildcard-aware helper.
  const can = (cap: 'doc.forms.read' | 'doc.forms.fill' | 'doc.forms.modify'): boolean =>
    ctx.doc?.security.allows(cap) ?? false;

  // ── snapshot loading ────────────────────────────────────────────────────
  const readSnapshot = async (): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    // No read authority → don't fire a doomed list (a reviewer-shaped token
    // without `doc.forms.read` is the COMMON narrowed scope); the model stays
    // empty and `canRead()` tells chrome why. The engine enforces regardless.
    if (!can('doc.forms.read')) {
      setStatus('forbidden');
      return;
    }
    if (!model().snapshot) setStatus('loading');
    try {
      const snapshot = await doc.forms.list();
      apply({ t: 'snapshot', snapshot });
      setStatus('ready');
      resynced.emit({ snapshot });
    } catch (err) {
      // A race with an access change 403s here; anything else is a real
      // load failure. Either way: surfaced, never an unhandled rejection.
      console.warn('[form] form snapshot failed to load', err);
      setStatus('error');
    }
  };
  // An invalidation that lands while a read is in flight queues one more
  // read after it — the snapshot can never settle stale (G5).
  let refreshRun: Promise<void> | null = null;
  let refreshAgain = false;
  const refresh = (): Promise<void> => {
    if (refreshRun) {
      refreshAgain = true;
      return refreshRun;
    }
    refreshRun = (async () => {
      do {
        refreshAgain = false;
        await readSnapshot();
      } while (refreshAgain);
    })().finally(() => {
      refreshRun = null;
    });
    return refreshRun;
  };

  // ── widget geometry (from the WIDGET plane: one annotations read/page) ──
  const geomLoading = new Set<number>();
  const ensureGeom = (page: PageRef): void => {
    const doc = ctx.doc;
    const pon = page.pageObjectNumber;
    if (!doc || geomLoading.has(pon) || model().geom[pon]) return;
    const crop = ctx.document()?.pages.find((p) => p.ref.pageObjectNumber === pon)?.boxes.crop;
    if (!crop) return;
    geomLoading.add(pon);
    void doc
      .page(page)
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

  // ── widget hit test ─────────────────────────────────────────────────────
  // The model's geometry when the page has it (and kick the lazy load so the
  // next call does); otherwise the annotation plane's live boxes — it is
  // whole-document hydrated, so a first click on a page already resolves.
  const widgetAt = (page: PageRef, point: { x: number; y: number }): WidgetHit | null => {
    const m = model();
    const pon = page.pageObjectNumber;
    ensureGeom(page);
    if (m.geom[pon]) return coreWidgetAt(m, pon, point);
    if (!annotationHost) return null;
    let best: WidgetHit | null = null;
    for (const item of annotationHost.listPageItems(page)) {
      if (!item.subtype.startsWith('widget') || item.ref?.kind !== 'objectNumber') continue;
      const box = item.box;
      const inside =
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height;
      if (!inside) continue;
      const field = coreFieldForWidget(m, item.ref.annotObjectNumber);
      if (!field) continue;
      if (!best || box.width * box.height < best.box.width * best.box.height) {
        best = { annotObjectNumber: item.ref.annotObjectNumber, field, box };
      }
    }
    return best;
  };

  // ── memoized fill projection ────────────────────────────────────────────
  // Session fill authority FUSES into the same `disabled` the field's
  // ReadOnly flag feeds (permissions.md: authority rides the flags gate) —
  // without `doc.forms.fill` every widget renders inert, so the pixels are
  // truthful and no gesture reaches a doomed write.
  const fuseFill = (item: FillItem | null, fillable: boolean): FillItem | null =>
    item === null || fillable || item.disabled ? item : { ...item, disabled: true };

  const fillCache = new Map<number, { seq: number; fillable: boolean; items: FillItem[] }>();
  const fillItems = (page: PageRef): FillItem[] => {
    const m = model();
    const pon = page.pageObjectNumber;
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
      if (result.effectsResult !== null) await refresh();
      return result;
    }

    const result = await doc.forms.setValue(ref, value);
    await refresh();
    return {
      status: result.changedWidgets.length > 0 ? 'applied' : 'unchanged',
      scripted: false,
      effectsResult: null,
      uiEffects: [],
      diagnostics: [],
    };
  };

  const assertFill = (operation: string): void => {
    // The optimistic gate: no fill authority → refuse BEFORE the spinner and
    // the queued engine call. (The fused projection renders such widgets
    // inert; this covers the imperative door.)
    if (!can('doc.forms.fill')) {
      throw new PluginError('permission-denied', 'form', `${operation} requires doc.forms.fill`, {
        details: { required: 'doc.forms.fill' },
      });
    }
  };
  const write = async (ref: FormFieldRef, value: FormFieldValue): Promise<SetValueResult> => {
    assertFill('form.setValue');
    const key = keyOf(ref);
    return enqueueMutation(async () => {
      const doc = ctx.doc;
      if (!doc) throw new PluginError('not-ready', 'form', 'no document');
      apply({ t: 'writeStart', key });
      try {
        const result = await commitValueNow(ref, value);
        if (result.status === 'rejected' || result.status === 'failed') {
          apply({ t: 'writeFailed', key });
        } else if (result.effectsResult === null && result.scripted) {
          // A scripted no-op has no engine read-back to clear the spinner.
          apply({ t: 'writeFailed', key });
        }
        if (result.status === 'rejected') {
          validationRejected.emit({ ref, issues: result.diagnostics });
        }
        return result;
      } catch (err) {
        apply({ t: 'writeFailed', key });
        throw toPluginError('form', err);
      }
    });
  };
  const writeBatch = async <R>(
    entries: readonly R[],
    run: (entry: R) => Promise<SetValueResult>,
    refOf: (entry: R) => FormFieldRef,
  ): Promise<BatchResult<FormFieldRef, R>> => {
    const applied: FormFieldRef[] = [];
    const failed: { ref: R; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
    for (const entry of entries) {
      try {
        const result = await run(entry);
        if (result.status === 'rejected' || result.status === 'failed') {
          failed.push({
            ref: entry,
            error: {
              code: result.status === 'rejected' ? 'invalid-input' : 'operation-failed',
              message: result.error?.message ?? result.diagnostics[0]?.message ?? result.status,
              capability: 'form',
            },
          });
        } else applied.push(refOf(entry));
      } catch (error) {
        failed.push({ ref: entry, error: toPluginErrorInfo(toPluginError('form', error)) });
      }
    }
    return { applied, skipped: [], failed };
  };

  // ── design mode ──────────────────────────────────────────────────────────
  // The annotation plane must re-read pages whose widget population changed
  // underneath it (created/deleted widgets); optional — fill-only setups
  // simply have no annotation plugin to nudge.
  const annotationHost = ctx.tryGet(AnnotationHostToken);

  const annotationActivation = async (ref: AnnotationRef) => {
    const doc = ctx.doc;
    if (!doc) return null;
    const loaded = annotationHost?.getRaw(ref);
    if (loaded?.subtype === 'widget') return loaded.actions?.activate ?? null;
    const { annotations } = await doc.page(ref.page).annotations.list();
    const annotation = annotations.find((candidate) => sameAnnotationRef(candidate.ref, ref));
    return annotation?.subtype === 'widget' ? (annotation.actions?.activate ?? null) : null;
  };

  const activateWidgetNow = async (
    ref: FormFieldRef,
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
    const result = await scripting.activate(ref, action);
    surfaceViaActions(result, 'user');
    if (result.effectsResult !== null) await refresh();
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
    await refresh();
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
      if (recalc.effectsResult !== null) await refresh();
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
  const widgetSource = (field: FormFieldRef, annotationRef: AnnotationRef): ActionSource => ({
    kind: 'widget',
    field,
    annotation: annotationRef,
    page: annotationRef.page,
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
    const loaded = annotationHost?.getRaw(annotationRef);
    if (loaded?.subtype !== 'widget') return null;
    return {
      enter: Boolean(loaded.actions?.cursorEnter?.root),
      exit: Boolean(loaded.actions?.cursorExit?.root),
    };
  };

  const nudgeAnnotations = (pages: Iterable<PageRef>): void => {
    if (!annotationHost) return;
    const seen = new Set<number>();
    for (const page of pages) {
      if (seen.has(page.pageObjectNumber)) continue;
      seen.add(page.pageObjectNumber);
      void annotationHost.reloadPage(page);
    }
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
  const pageBox = (page: PageRef): Box | null => {
    const pon = page.pageObjectNumber;
    const crop = ctx.document()?.pages.find((p) => p.ref.pageObjectNumber === pon)?.boxes.crop;
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

  const createFieldNow = async (input: CreateFieldInput): Promise<CreatedField> => {
    const doc = ctx.doc;
    const page = input.page;
    const pon = page.pageObjectNumber;
    const crop = ctx.document()?.pages.find((p) => p.ref.pageObjectNumber === pon)?.boxes.crop;
    if (!doc || !crop) {
      throw new PluginError('not-ready', 'form', 'createField: document/page not ready');
    }
    // Placement is page-bound: intersect a (possibly overshooting) drag box
    // with the page. Sizing policy is the CALLER's job (the place handler's
    // click policy / drag rect) — a degenerate result is a caller bug.
    const bounds = pageBox(page)!;
    const x = Math.max(bounds.x, Math.min(input.bounds.x, bounds.width));
    const y = Math.max(bounds.y, Math.min(input.bounds.y, bounds.height));
    const box: Box = {
      x,
      y,
      width: Math.max(0, Math.min(input.bounds.x + input.bounds.width, bounds.width) - x),
      height: Math.max(0, Math.min(input.bounds.y + input.bounds.height, bounds.height) - y),
    };
    if (box.width < 1 || box.height < 1) {
      throw new PluginError(
        'invalid-input',
        'form',
        'createField: degenerate bounds (size the box before placing)',
      );
    }
    const { family, appearance } = input;
    const name = input.name ?? autoName(family);
    const placement = {
      page,
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
              options: input.options
                ? input.options.map((o) => ({ ...o }))
                : [
                    { label: 'Option 1', value: 'Option 1' },
                    { label: 'Option 2', value: 'Option 2' },
                  ],
            }
          : { family, name, widget: placement };
    const result = await doc.forms.createField(draft);
    await refresh();
    apply({ t: 'clearGeom', pageObjectNumber: pon });
    // AWAIT the annotation-plane reload so the returned widget ref is already
    // selectable — the caller's auto-select needs the model to know it.
    if (annotationHost) await annotationHost.reloadPage(page);
    const widget = result.field.widgets.find((w) => w.page?.pageObjectNumber === pon) ?? null;
    return { field: result.field, widget };
  };

  const updateFieldNow = async (ref: FormFieldRef, patch: FormFieldPatch): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    await doc.forms.updateField(ref, patch);
    await refresh();
  };

  const deleteFieldNow = async (ref: FormFieldRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    const field = fieldByKey(model(), keyOf(ref));
    const pages = field?.widgets.flatMap((w) => (w.page ? [w.page] : [])) ?? [];
    await doc.forms.deleteField(ref);
    await refresh();
    for (const pon of new Set(pages.map((p) => p.pageObjectNumber))) {
      apply({ t: 'clearGeom', pageObjectNumber: pon });
    }
    nudgeAnnotations(pages);
  };

  const detachWidgetNow = async (ref: FormFieldRef, widget: AnnotationRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    await doc.forms.detachWidget(ref, widget);
    await refresh();
    apply({ t: 'clearGeom', pageObjectNumber: widget.page.pageObjectNumber });
    nudgeAnnotations([widget.page]);
  };
  const attachWidgetNow = async (ref: FormFieldRef, widget: AnnotationRef): Promise<void> => {
    const doc = ctx.doc;
    if (!doc) return;
    await doc.forms.attachWidget(ref, widget);
    await refresh();
    apply({ t: 'clearGeom', pageObjectNumber: widget.page.pageObjectNumber });
    nudgeAnnotations([widget.page]);
  };

  // ── reads over the snapshot ──
  const widgetObjectOf = (widget: WidgetAddress): number =>
    'kind' in widget
      ? widget.kind === 'objectNumber'
        ? widget.annotObjectNumber
        : 0
      : widget.annotObjectNumber;
  const listFields = (filter?: FormFilter): readonly FormFieldDTO[] => {
    const fields = model().snapshot?.fields ?? [];
    if (!filter) return fields;
    const page = filter.page;
    return fields.filter(
      (f) =>
        (!filter.family || f.family === filter.family) &&
        (filter.name === undefined || f.name === filter.name) &&
        (!page || f.widgets.some((w) => w.page && pageRefsEqual(w.page, page))),
    );
  };
  const valueOf = (field: FormFieldDTO): FormFieldValue | null => {
    const entry = field.valueEntry;
    if (entry.kind === 'none' || entry.kind === 'unsupported') return null;
    if (field.family === 'checkbox' || field.family === 'radio') {
      return {
        type: 'toggle',
        state: entry.kind === 'scalar' ? entry.value : (entry.values[0] ?? null),
      };
    }
    if (field.family === 'combobox' || field.family === 'listbox') {
      return {
        type: 'choice',
        values: entry.kind === 'scalar' ? [entry.value] : [...entry.values],
      };
    }
    return {
      type: 'text',
      value: entry.kind === 'scalar' ? entry.value : entry.values.join('\n'),
    };
  };
  const exportValues = (): Readonly<Record<string, FormFieldValue>> => {
    const out: Record<string, FormFieldValue> = {};
    for (const field of model().snapshot?.fields ?? []) {
      const value = valueOf(field);
      if (value) out[field.name] = value;
    }
    return out;
  };
  const resetAll = async (
    options: { fields?: readonly FormFieldRef[]; exclude?: boolean } = {},
  ): Promise<BatchResult<FormFieldRef, FormFieldRef>> => {
    assertFill('form.resetAll');
    const targets =
      options.fields?.map(
        (ref): PdfActionTargetRef =>
          ref.kind === 'objectNumber'
            ? { kind: 'objectNumber', objectNumber: ref.fieldObjectNumber }
            : { kind: 'name', name: ref.name },
      ) ?? null;
    const snapshot = model().snapshot ?? (await ctx.doc!.forms.list());
    const { selected } = resolveFieldSelection(snapshot.fields, targets, options.exclude ?? false);
    const refs = selected
      .filter((f) => f.family !== 'pushbutton' && f.family !== 'signature')
      .map((f) => f.ref);
    const result = await resetFormAction(targets, options.exclude ?? false, 'user');
    if (result.status === 'failed') {
      const failed = (result.effectsResult?.results ?? [])
        .filter((entry) => entry.status === 'failed' || entry.status === 'rejected')
        .flatMap((entry) => entry.fields.map((f) => f.ref));
      const failedKeys = new Set(failed.map(keyOf));
      return {
        applied: refs.filter((r) => !failedKeys.has(keyOf(r))),
        skipped: [],
        failed: failed.map((ref) => ({
          ref,
          error: { code: 'operation-failed' as const, message: 'reset failed', capability: 'form' },
        })),
      };
    }
    return { applied: refs, skipped: [], failed: [] };
  };

  // ── confirmed document facts: announce, then reconcile ──
  const STRUCTURAL = new Set<DocumentEvent['type']>([
    'form.fieldCreated',
    'form.fieldUpdated',
    'form.fieldDeleted',
    'form.widgetAttached',
    'form.widgetDetached',
    'form.repaired',
  ]);
  const clearGeom = (): void => {
    ctx.dispatch({ type: 'SET_MODEL', model: updateModel(model(), { t: 'clearGeom' }) });
  };
  const announce = (event: DocumentEvent): void => {
    if (!('origin' in event)) return;
    const origin: ChangeOrigin = originOf(event);
    switch (event.type) {
      case 'form.valueChanged':
        valueChanged.emit({ ref: event.field.ref, field: event.field, origin });
        break;
      case 'form.fieldCreated':
        fieldCreated.emit({ ref: event.field.ref, field: event.field, origin });
        break;
      case 'form.fieldUpdated':
      case 'form.widgetAttached':
      case 'form.widgetDetached':
        fieldUpdated.emit({ ref: event.field.ref, field: event.field, origin });
        break;
      case 'form.fieldDeleted':
        fieldDeleted.emit({
          ref: { kind: 'objectNumber', fieldObjectNumber: event.deletedFieldObjectNumber },
          field: null,
          origin,
        });
        break;
      default:
        break;
    }
  };
  const onDocumentEvent = (event: DocumentEvent): void => {
    announce(event);
    if (event.type === 'stream.desynced') {
      void refresh();
      return;
    }
    if (event.type === 'document.versioned' || event.type === 'signature.completed') {
      void refresh();
      return;
    }
    if (!event.type.startsWith('form.') || !('origin' in event)) return;
    const structural = STRUCTURAL.has(event.type);
    if (event.origin.kind !== 'remote' && !structural) return; // own writes refreshed already
    if (structural) clearGeom();
    void refresh();
  };

  const api: FormHostCapability = {
    getSnapshot: () => model().snapshot,
    refresh,
    listFillItems: fillItems,
    getFillItem: fillItem,
    ensureLoaded: ensureGeom,
    getField: (ref) => fieldByKey(model(), keyOf(ref)),
    getFieldForWidget: (widget) => coreFieldForWidget(model(), widgetObjectOf(widget)),
    getWidgetAt: widgetAt,
    setText: (ref, text) => write(ref, { type: 'text', value: text }),
    setChecked: (ref, onState) => write(ref, { type: 'toggle', state: onState }),
    setChoice: (ref, values) => write(ref, { type: 'choice', values: [...values] }),
    reset: async (ref) => {
      assertFill('form.reset');
      const key = keyOf(ref);
      return enqueueMutation(async () => {
        const doc = ctx.doc;
        if (!doc) return;
        apply({ t: 'writeStart', key });
        try {
          if (doc.forms.applyEffects) {
            const result = await applyResetBatch([ref], 'user');
            if (result.status === 'failed') {
              throw new PluginError(
                'operation-failed',
                'form',
                result.effectsResult?.results.find(
                  (entry) => entry.status === 'failed' || entry.status === 'rejected',
                )?.error?.message ?? 'reset failed',
              );
            }
            const field = fieldByKey(model(), key);
            if (field) apply({ t: 'writeDone', key, field });
            else apply({ t: 'writeFailed', key });
          } else {
            const result = await doc.forms.reset(ref);
            apply({ t: 'writeDone', key, field: result.field });
          }
        } catch (err) {
          apply({ t: 'writeFailed', key });
          throw toPluginError('form', err);
        }
      });
    },
    setValue: write,
    activateWidget: async (annotationRef): Promise<WidgetActivationResult> => {
      const field = coreFieldForWidget(model(), widgetObjectOf(annotationRef));
      if (!field) throw new PluginError('not-found', 'form', 'no form field owns this widget');
      const actions = ctx.tryGet(ActionsToken);
      if (actions) {
        const result = await actions.dispatch({
          scope: 'activate',
          ref: annotationRef,
          page: annotationRef.page,
          source: widgetSource(field.ref, annotationRef),
        });
        const noTree =
          result.status === 'inert' && result.steps.length === 0 && result.diagnostics.length === 0;
        if (!noTree) return { kind: 'dispatched', result };
      }
      return {
        kind: 'form',
        result: await enqueueMutation(() => activateWidgetNow(field.ref, annotationRef)),
      };
    },
    notifyWidgetEvent: (fieldRef, annotationRef, event) => {
      const actions = ctx.tryGet(ActionsToken);
      if (!actions) return;
      const source = widgetSource(fieldRef, annotationRef);
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
          page: annotationRef.page,
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
        page: annotationRef.page,
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
      await refresh();
      if (annotationHost) {
        const seen = new Set<number>();
        for (const widget of result.changedWidgets) {
          if (!widget.page || seen.has(widget.page.pageObjectNumber)) continue;
          seen.add(widget.page.pageObjectNumber);
          await annotationHost.reloadPage(widget.page);
        }
      }
      return result;
    },
    setValueRaw: (ref, value) =>
      enqueueMutation(async () => {
        const doc = ctx.doc;
        if (!doc) throw new PluginError('not-ready', 'form', 'no document');
        const result = await doc.forms.setValue(ref, value);
        await refresh();
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
        await refresh();
        return result;
      }),
    createField: (input) => enqueueMutation(() => createFieldNow(input)),
    getPageBox: pageBox,
    updateField: (ref, patch) => enqueueMutation(() => updateFieldNow(ref, patch)),
    deleteField: (ref) => enqueueMutation(() => deleteFieldNow(ref)),
    detachWidget: (ref, widget) => enqueueMutation(() => detachWidgetNow(ref, widget)),
    attachWidget: (ref, widget) => enqueueMutation(() => attachWidgetNow(ref, widget)),
    getStatus: () => ctx.getState().status,
    listFields,
    getValue: (ref) => {
      const field = fieldByKey(model(), keyOf(ref));
      return field ? valueOf(field) : null;
    },
    listWidgets: fillItems,
    setValues: async (entries) => {
      const result = await writeBatch(
        entries,
        (entry) => write(entry.ref, entry.value),
        (entry) => entry.ref,
      );
      const out: BatchResult<FormFieldRef, FormFieldRef> = {
        applied: result.applied,
        skipped: [],
        failed: result.failed.map((f) => ({ ref: f.ref.ref, error: f.error })),
      };
      return out;
    },
    resetAll,
    exportValues,
    importValues: (values) =>
      writeBatch(
        Object.keys(values),
        (name) => write({ kind: 'fqn', name }, values[name]!),
        (name) => ({ kind: 'fqn', name }),
      ),
    onValueChanged: valueChanged.on,
    onFieldCreated: fieldCreated.on,
    onFieldUpdated: fieldUpdated.on,
    onFieldDeleted: fieldDeleted.on,
    onValidationRejected: validationRejected.on,
    onResynced: resynced.on,
    canRead: () => can('doc.forms.read'),
    canFill: () => can('doc.forms.fill'),
    canDesign: () => can('doc.forms.modify'),
  };

  return {
    api,
    connect() {
      const doc = ctx.doc;
      const off = doc?.events?.subscribe(onDocumentEvent);
      if (off) ctx.cleanup(off);
      void refresh();
    },
  };
}
