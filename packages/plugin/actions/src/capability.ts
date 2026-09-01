import {
  createEventHook,
  createSerialQueue,
  DocumentsToken,
  type PluginContext,
  type Unsubscribe,
} from '@embedpdf/core';
import {
  createScriptHost,
  javaScriptProgramFromActionTree,
  resolveScriptIdentity,
  scriptFieldsFromSnapshot,
  seedFrom,
} from '@embedpdf/core-acrojs';
import type {
  ScriptAnnotInput,
  ScriptColorArray,
  ScriptDiagnostic,
  ScriptEventInput,
  ScriptExecutionError,
  ScriptOutput,
  ScriptUiEffect,
  ScriptWorldInput,
} from '@embedpdf/core-acrojs';
import type {
  AnnotationRef,
  DocumentActionsSnapshot,
  FormSnapshot,
  FormSubmissionRequest,
  PageObjectNumber,
  PdfActionNode,
  PdfActionTree,
  PdfActionType,
  PdfAnnotationActions,
  PdfPageActions,
  SubmitFormPayload,
} from '@embedpdf/engine-core/runtime';

import { eventOf, originOf } from './types';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionDispatchResult,
  ActionExecutor,
  ActionNodeResult,
  ActionNodeStatus,
  ActionOrigin,
  ActionPolicy,
  ActionPolicyDecision,
  ActionPolicyRow,
  ActionsAction,
  ActionsCapability,
  ActionsHostCapability,
  ActionsPluginConfig,
  ActionsState,
  ActionSource,
  ActionStepResult,
  ActionSubmitHandler,
  ActionSubmitRequest,
  ActionTrigger,
  ActionTriggerResult,
  ActionUiAdapter,
  AnnotCommitEntry,
  AnnotCommitSink,
  DocumentTriggerEvent,
  FormCommitSink,
  PageStateReport,
  ScriptSurfaceResult,
  SubmitIntent,
  SubmitResolver,
} from './types';

const ALLOW_ALL: ActionPolicyRow = { user: 'allow', hover: 'allow', lifecycle: 'allow' };

const DEFAULT_POLICY: ActionPolicy = {
  goto: ALLOW_ALL,
  named: ALLOW_ALL,
  hide: ALLOW_ALL,
  'reset-form': ALLOW_ALL,
  javascript: ALLOW_ALL,
  // No auto-opened tabs: only a real user activation reaches the adapter.
  uri: { user: 'adapter', hover: 'report', lifecycle: 'report' },
  // The Named Print verb: adapter on user gestures, blocked otherwise.
  print: { user: 'adapter', hover: 'block', lifecycle: 'block' },
  // The sink chain (handler → the document's home → blocked) on user
  // gestures only; hover/lifecycle submits never leave the viewer.
  'submit-form': { user: 'adapter', hover: 'block', lifecycle: 'block' },
};

/** Never executable, not configurable — diagnostics only. */
const NEVER_TYPES: ReadonlySet<PdfActionType> = new Set([
  'launch',
  'goto-remote',
  'goto-embedded',
  'sound',
  'movie',
  'import-data',
]);

/** Recognized types with no Phase-1 interpreter. */
const UNSUPPORTED_TYPES: ReadonlySet<PdfActionType> = new Set([
  'rendition',
  'thread',
  'set-ocg-state',
  'transition',
  'goto-3d-view',
  'unknown',
]);

/** Document-lifetime node types: engine mutations, committed in walk order. */
const DOCUMENT_TYPES: ReadonlySet<PdfActionType> = new Set(['reset-form', 'javascript']);

const sameRef = (left: AnnotationRef, right: AnnotationRef): boolean => {
  if (left.kind === 'objectNumber' && right.kind === 'objectNumber') {
    return left.annotObjectNumber === right.annotObjectNumber;
  }
  if (left.kind === 'nm' && right.kind === 'nm') {
    return left.pageObjectNumber === right.pageObjectNumber && left.nm === right.nm;
  }
  if (left.kind === 'index' && right.kind === 'index') {
    return left.pageObjectNumber === right.pageObjectNumber && left.index === right.index;
  }
  return false;
};

const isPrintVerb = (node: PdfActionNode): boolean =>
  node.type === 'named' && node.name === 'Print';

export function createActionsCapability(
  ctx: PluginContext<ActionsState, ActionsAction>,
  config: ActionsPluginConfig = {},
): ActionsHostCapability {
  const policy: ActionPolicy = { ...DEFAULT_POLICY, ...config.policy };
  const enqueue = createSerialQueue();
  const executors = new Map<PdfActionType, ActionExecutor>();
  let annotCommitSink: AnnotCommitSink | null = null;
  let formCommitSink: FormCommitSink | null = null;
  let uiAdapter: ActionUiAdapter | null = null;
  /** Sink 1 of the submit chain (consent = installation). */
  let submitHandler: ActionSubmitHandler | null = null;
  /** The form plugin's dataset resolver (D7's one door). */
  let submitResolver: SubmitResolver | null = null;
  /** D3's document-print latch: while a print event wrapper is active, a
   *  nested print request is SUPPRESSED (`reentrant-print`) — the adapter
   *  opens exactly one dialog per outer request. */
  let docPrintEventActive = false;
  /** D11's deterministic aggregate: JS nodes run in the CURRENT dispatch. */
  let jsNodesThisDispatch = 0;

  const actionHook = createEventHook<import('./types').ActionDispatchEvent>((error) =>
    globalThis.console?.error('[actions] onAction observer failed:', error),
  );
  const diagnosticHook = createEventHook<ActionDiagnostic>((error) =>
    globalThis.console?.error('[actions] onDiagnostic observer failed:', error),
  );
  const scriptDiagnosticHook = createEventHook<ScriptDiagnostic>((error) =>
    globalThis.console?.error('[actions] onScriptDiagnostic observer failed:', error),
  );
  const scriptErrorHook = createEventHook<ScriptExecutionError>((error) =>
    globalThis.console?.error('[actions] onScriptError observer failed:', error),
  );
  ctx.cleanup(() => {
    actionHook.dispose();
    diagnosticHook.dispose();
    scriptDiagnosticHook.dispose();
    scriptErrorHook.dispose();
  });

  /** Policy lookup — `null` means "recognized, no interpreter" (inert). */
  const decisionFor = (
    node: PdfActionNode,
    origin: ActionOrigin,
  ): ActionPolicyDecision | 'never' | 'unsupported' => {
    if (NEVER_TYPES.has(node.type)) return 'never';
    if (UNSUPPORTED_TYPES.has(node.type)) return 'unsupported';
    if (isPrintVerb(node)) return policy.print[origin];
    const row = policy[node.type as keyof ActionPolicy] as ActionPolicyRow | undefined;
    return row ? row[origin] : 'unsupported';
  };

  const allowsPrint = (): boolean =>
    ctx.tryGet(DocumentsToken)?.allows('doc.print', ctx.documentId ?? undefined) ?? true;

  // ── the ONE catalog-actions read (D11) ──────────────────────────────────
  // The catalog /AA is immutable in-session (no writer exists in the
  // stack), so the open sequence, boot sources, and the five document
  // events share one memoized read. A REJECTED read is evicted so a
  // transient failure cannot poison every future lifecycle event.
  let actionsSnapshotPromise: Promise<DocumentActionsSnapshot | null> | null = null;
  const readDocumentActions = (): Promise<DocumentActionsSnapshot | null> => {
    if (!actionsSnapshotPromise) {
      const doc = ctx.doc;
      const read: Promise<DocumentActionsSnapshot | null> = doc?.actions
        ? Promise.resolve(doc.actions.read())
        : Promise.resolve(null);
      const memo: Promise<DocumentActionsSnapshot | null> = read.catch((error: unknown) => {
        if (actionsSnapshotPromise === memo) actionsSnapshotPromise = null;
        throw error;
      });
      actionsSnapshotPromise = memo;
    }
    return actionsSnapshotPromise;
  };

  /** The Table-200 key for each verb-shaped document trigger event. */
  const DOC_EVENT_TREES = {
    'will-save': 'willSave',
    'did-save': 'didSave',
    'will-print': 'willPrint',
    'did-print': 'didPrint',
    'will-close': 'willClose',
  } as const;

  // ── the submit pipeline (D7): one intent, one resolver, one sink chain ──
  const nowMs = (): number => js?.now?.() ?? Date.now();

  const intentOfPayload = (payload: SubmitFormPayload): SubmitIntent => ({
    url: payload.url,
    fields: payload.fields,
    exclude: payload.flags.exclude,
    includeNoValueFields: payload.flags.includeNoValueFields,
    format: payload.flags.format,
    method: payload.flags.method,
    flagsRaw: payload.flags.raw,
    ...(payload.charSet === undefined ? {} : { charSet: payload.charSet }),
  });

  const toFormSubmissionRequest = (request: ActionSubmitRequest): FormSubmissionRequest => ({
    entries: request.entries,
    intent: {
      url: request.url,
      format: request.format,
      method: request.method,
      flagsRaw: request.flagsRaw,
      ...(request.charSet === undefined ? {} : { charSet: request.charSet }),
    },
    origin: request.origin,
    clientTimeMs: nowMs(),
  });

  /**
   * The ONE submit door — both sources land here after policy. Sink order:
   * embedder handler (explicit beats ambient; detached-promise contract) →
   * the document's home (`doc.forms.submit`, engine-asserted, AWAITED — a
   * real op with a real receipt) → blocked with `no-submit-sink`. Never a
   * network call from this plugin.
   */
  const performSubmit = async (
    intent: SubmitIntent,
    actionCtx: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
    const decision = policy['submit-form'][actionCtx.origin];
    if (decision !== 'adapter' && decision !== 'allow') {
      diagnose({
        code: 'blocked',
        message: `submit-form: policy '${decision}' for origin '${actionCtx.origin}'`,
      });
      return { status: 'blocked' };
    }
    if (!submitResolver) {
      diagnose({
        code: 'no-submit-resolver',
        message: 'submit-form: no dataset resolver registered (form plugin missing?)',
      });
      return { status: 'blocked', detail: 'no dataset resolver' };
    }
    let request: ActionSubmitRequest;
    try {
      request = await submitResolver(intent, actionCtx, diagnose);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      diagnose({ code: 'executor-failed', message: `submit-form: dataset resolution: ${detail}` });
      return { status: 'failed', detail };
    }
    const doc = ctx.doc;
    const homeSubmit =
      doc && typeof doc.forms.submit === 'function'
        ? () => Promise.resolve(doc.forms.submit!(toFormSubmissionRequest(request)))
        : null;
    if (submitHandler) {
      try {
        const outcome = submitHandler(request, { submitToDocumentHome: homeSubmit });
        if (outcome && typeof (outcome as Promise<void>).then === 'function') {
          // DETACHED by contract: `executed` means "handed to the embedder";
          // a later rejection is observability, never a node-result rewrite.
          void (outcome as Promise<void>).catch((error: unknown) => {
            diagnosticHook.emit({
              code: 'executor-failed',
              message: `submit handler rejected (detached): ${
                error instanceof Error ? error.message : String(error)
              }`,
            });
          });
        }
        return { status: 'executed' };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        diagnose({ code: 'executor-failed', message: `submit handler threw: ${detail}` });
        return { status: 'failed', detail };
      }
    }
    if (homeSubmit) {
      try {
        await homeSubmit();
        return { status: 'executed' };
      } catch (error) {
        // The engine's refusal (authority, transport) surfaced on the node —
        // enforcement lives at the home's boundary, we just report it.
        const detail = error instanceof Error ? error.message : String(error);
        diagnose({ code: 'executor-failed', message: `document home refused submit: ${detail}` });
        return { status: 'failed', detail };
      }
    }
    diagnose({
      code: 'no-submit-sink',
      message: 'submit-form: no handler installed and the document has no submit-capable home',
    });
    return { status: 'blocked', detail: 'no submit sink' };
  };

  // ── the ONE per-document ScriptHost (D8) ────────────────────────────────
  const js = config.javascript;
  const scriptHost =
    js?.enabled && ctx.doc
      ? createScriptHost({
          sandboxFactory:
            js.sandboxFactory ??
            (() =>
              import('@embedpdf/core-js-sandbox').then(({ createQuickJsSandbox }) =>
                createQuickJsSandbox(),
              )),
          document: () => {
            const meta = ctx.document();
            return {
              id: ctx.documentId ?? 'document',
              fileName: js.fileName?.() ?? meta?.name ?? 'document.pdf',
              pageCount: meta?.pageCount ?? 0,
              pageNumber: 0,
            };
          },
          identity: () =>
            ctx.doc
              ? resolveScriptIdentity(ctx.doc, js.identity)
              : { name: '', loginName: '', corporation: '', email: '' },
          environment: (sequence) => {
            const nowMs = js.now?.() ?? Date.now();
            return {
              nowMs,
              utcOffsetMinutes: js.utcOffsetMinutes?.() ?? -new Date(nowMs).getTimezoneOffset(),
              randomSeed: js.randomSeed?.() ?? seedFrom(ctx.documentId ?? 'document', sequence),
            };
          },
          bootSources: async () => {
            const snapshot = await readDocumentActions();
            return (snapshot?.nameTreeScripts ?? []).map(({ action }) =>
              javaScriptProgramFromActionTree(action),
            );
          },
          ...(js.budget ? { budget: js.budget } : {}),
        })
      : null;
  if (scriptHost) ctx.cleanup(() => scriptHost.dispose());

  // ── surface door (D9): the ONE UI/diagnostic port for script results ────
  // Print and submitForm effects arriving from the ACTIONS plane never
  // reach this door (the js executor extracts them and routes through
  // `firePrintThroughAdapter` / `performSubmit` post-transaction — the
  // WP/DP wrap and the post-commit dataset need to run outside the host
  // transaction). Effects here come from the FORM pipeline's K/V/C/F path.
  const surfaceScriptResult = (result: ScriptSurfaceResult): void => {
    const uiContext = { origin: result.origin, phase: result.phase };
    for (const effect of result.uiEffects) {
      if (effect.kind === 'submitForm') {
        // Form-pipeline scripted submit: same door, DETACHED (the form
        // queue must not await into submit sinks). Policy + sinks +
        // diagnostics all live inside performSubmit.
        void performSubmit(
          intentOfSubmitEffect(effect),
          {
            origin: result.origin,
            source: { kind: 'api' },
            event: { scope: 'activate' },
          },
          (diagnostic) => diagnosticHook.emit(diagnostic),
        );
        continue;
      }
      // PERMISSION, not preference: a print request without doc.print
      // authority reaches no adapter — non-overridable, observable.
      if (effect.kind === 'print' && !allowsPrint()) {
        scriptDiagnosticHook.emit({
          code: 'ui-effect-suppressed',
          message: 'script print request withheld: doc.print is not allowed',
        });
        continue;
      }
      // D3's latch: a WillPrint/DidPrint script (or anything running while
      // a print wrapper is active) printing again is suppressed — one
      // dialog per outer request.
      if (effect.kind === 'print' && docPrintEventActive) {
        scriptDiagnosticHook.emit({
          code: 'ui-effect-suppressed',
          message: 'script print request during a document print event — suppressed (reentrant)',
        });
        continue;
      }
      if (!uiAdapter) {
        diagnosticHook.emit({
          code: 'no-adapter',
          message: `script ${effect.kind}: no UI adapter installed`,
        });
        continue;
      }
      if (effect.kind === 'alert') {
        uiAdapter.alert?.(effect.message, {
          ...uiContext,
          icon: effect.icon,
          ...(effect.title !== undefined ? { title: effect.title } : {}),
        });
      } else if (effect.kind === 'gotoPage') {
        uiAdapter.gotoPage?.(effect.page, uiContext);
      } else {
        uiAdapter.print(uiContext);
      }
    }
    for (const diagnostic of result.diagnostics) scriptDiagnosticHook.emit(diagnostic);
    if (result.error) scriptErrorHook.emit(result.error);
  };

  /** Script `doc.submitForm(...)` → the one normalized intent. Script field
   *  names are include-mode by definition (Acrobat's aFields). */
  const intentOfSubmitEffect = (
    effect: Extract<ScriptUiEffect, { kind: 'submitForm' }>,
  ): SubmitIntent => {
    const format = effect.format ?? 'fdf';
    return {
      url: effect.url,
      fields: effect.fieldNames?.map((name) => ({ kind: 'name' as const, name })) ?? null,
      exclude: false,
      includeNoValueFields: effect.includeEmpty,
      format,
      method: effect.method ?? 'post',
      flagsRaw: 0,
    };
  };

  // ── script world building (D6: page-scoped prefetch) ────────────────────
  const engineColorToArray = (
    color: { r: number; g: number; b: number } | null | undefined,
  ): ScriptColorArray => (color ? ['RGB', color.r / 255, color.g / 255, color.b / 255] : ['T']);

  const pageIndexOf = (pon: PageObjectNumber): number =>
    ctx.document()?.pages.findIndex((page) => page.pageObjectNumber === pon) ?? -1;

  const scriptWorldFor = async (
    pon: PageObjectNumber,
  ): Promise<{ snapshot: FormSnapshot; world: Omit<ScriptWorldInput, 'event'> }> => {
    const doc = ctx.doc!;
    const snapshot = await doc.forms.list();
    const pageIndex = Math.max(0, pageIndexOf(pon));
    const { annotations } = await doc.page(pon).annotations.list();
    const annots: ScriptAnnotInput[] = annotations
      // Script-addressable = everything EXCEPT link and widget (they are
      // Link/Field objects in Acrobat and separate planes here).
      .filter((a) => a.subtype !== 'link' && !a.subtype.startsWith('widget'))
      .map((a) => {
        const styled = a as unknown as {
          color?: { r: number; g: number; b: number };
          interiorColor?: { r: number; g: number; b: number } | null;
          opacity?: number;
          strokeWidth?: number;
          borderStyle?: string;
          dashArray?: number[];
        };
        return {
          ref: a.ref,
          name: a.nm ?? '',
          subtype: a.subtype,
          page: pageIndex,
          rect: [a.rect.left, a.rect.bottom, a.rect.right, a.rect.top] as [
            number,
            number,
            number,
            number,
          ],
          contents: a.contents ?? '',
          author: a.author ?? '',
          subject: a.subject ?? '',
          strokeColor: engineColorToArray(styled.color),
          fillColor: engineColorToArray(styled.interiorColor),
          opacity: styled.opacity ?? 1,
          width: styled.strokeWidth ?? 1,
          borderStyle: styled.borderStyle === 'dashed' ? ('D' as const) : ('S' as const),
          dash: styled.dashArray ?? [],
          hidden: a.flags.hidden,
          print: a.flags.print,
          readOnly: a.flags.readOnly,
          locked: a.flags.locked,
          noView: a.flags.noView,
          toggleNoView: a.flags.toggleNoView,
          opaqueBody: a.subtype === 'stamp',
        };
      });
    return {
      snapshot,
      world: {
        fields: scriptFieldsFromSnapshot(snapshot),
        annots,
        annotPages: [pageIndex],
        annotsCoverDocument: (ctx.document()?.pageCount ?? 0) <= 1,
      },
    };
  };

  const ANNOTATION_EVENT_NAMES: Record<string, string> = {
    cursorEnter: 'Mouse Enter',
    cursorExit: 'Mouse Exit',
    mouseDown: 'Mouse Down',
    mouseUp: 'Mouse Up',
    focus: 'Focus',
    blur: 'Blur',
  };
  const PAGE_EVENT_NAMES: Record<string, string> = {
    open: 'Open',
    close: 'Close',
    // No Acrobat equivalent for the PV/PI names — EmbedPDF extension.
    visible: 'Visible',
    invisible: 'Invisible',
  };
  // The two-standard bridge (D5): the /AA keys are ISO 32000-2 Table 200;
  // the camelCase event names live in the JS API layer (ISO 21757-1 /
  // Acrobat) — only the key half is verifiable against the in-repo spec.
  const DOC_EVENT_NAMES: Record<string, string> = {
    open: 'Open',
    'will-save': 'WillSave',
    'did-save': 'DidSave',
    'will-print': 'WillPrint',
    'did-print': 'DidPrint',
    'will-close': 'WillClose',
  };

  const scriptEventFor = (actionCtx: ActionContext, snapshot: FormSnapshot): ScriptEventInput => {
    const provenance = actionCtx.event;
    const type =
      provenance.scope === 'page'
        ? 'Page'
        : provenance.scope === 'document'
          ? 'Doc'
          : actionCtx.source.kind === 'widget'
            ? 'Field'
            : actionCtx.source.kind === 'link'
              ? 'Link'
              : 'Annot'; // EmbedPDF extension — Acrobat has no plain-annot type
    const name =
      provenance.scope === 'activate'
        ? 'Mouse Up'
        : provenance.scope === 'annotation'
          ? (ANNOTATION_EVENT_NAMES[provenance.name] ?? 'Mouse Up')
          : provenance.scope === 'page'
            ? (PAGE_EVENT_NAMES[provenance.name] ?? 'Open')
            : (DOC_EVENT_NAMES[provenance.name] ?? 'Open');
    const targetRef = actionCtx.source.kind === 'widget' ? actionCtx.source.field : undefined;
    const targetField = targetRef
      ? snapshot.fields.find((field) =>
          targetRef.kind === 'objectNumber' && field.ref.kind === 'objectNumber'
            ? field.ref.fieldObjectNumber === targetRef.fieldObjectNumber
            : targetRef.kind === 'fqn' && field.name === targetRef.name,
        )
      : undefined;
    return {
      kind: 'widget-activate',
      type,
      name,
      ...(targetRef ? { target: targetRef, source: targetRef } : {}),
      ...(targetField && targetField.valueEntry.kind === 'scalar'
        ? { value: targetField.valueEntry.value }
        : {}),
    };
  };

  /** Commit one run's document effects through the owner sinks in the
   *  DECLARED order (form first, then annot); the first failure skips the
   *  rest across BOTH streams. Returns the failure summary, if any. */
  const commitScriptOutput = async (
    output: ScriptOutput,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<string | null> => {
    let failure: string | null = null;
    if (output.formEffects.length > 0) {
      if (!formCommitSink) {
        diagnose({
          code: 'no-commit-sink',
          message: `script form effects dropped: no form commit sink registered (${output.formEffects.length})`,
        });
      } else {
        const result = await formCommitSink(output.formEffects);
        const bad = result.results.find(
          (entry) => entry.status === 'failed' || entry.status === 'rejected',
        );
        if (bad) failure = `form effect ${bad.index}: ${bad.error?.message ?? bad.status}`;
      }
    }
    if (output.annotEffects.length > 0) {
      if (failure) {
        diagnose({
          code: 'executor-failed',
          message: `script annot effects skipped after form failure (${output.annotEffects.length})`,
        });
      } else if (!annotCommitSink) {
        diagnose({
          code: 'no-commit-sink',
          message: `script annot effects dropped: no annotation commit sink registered (${output.annotEffects.length})`,
        });
      } else {
        const entries: AnnotCommitEntry[] = output.annotEffects.map((effect) => ({
          annotObjectNumber:
            effect.ref.kind === 'objectNumber' ? effect.ref.annotObjectNumber : -1,
          ...(effect.ref.kind === 'objectNumber'
            ? { pageObjectNumber: effect.ref.pageObjectNumber }
            : {}),
          patch: effect.patch,
        }));
        const result = await annotCommitSink(entries);
        const bad = result.results.find((entry) => entry.status === 'failed');
        if (bad) failure = `annotation ${bad.annotObjectNumber}: ${bad.error ?? 'failed'}`;
      }
    }
    if (failure) diagnose({ code: 'executor-failed', message: `script commit: ${failure}` });
    return failure;
  };

  // ── the REAL `javascript` executor: one node = one host transaction with
  //    prefetch → boot? → run → commit → surface INSIDE the boundary ───────
  if (scriptHost) {
    const nodeCap = js?.maxScriptNodesPerDispatch ?? 16;
    executors.set('javascript', async (node, actionCtx) => {
      if (node.type !== 'javascript') return { status: 'inert', reason: 'not a JS node' };
      const doc = ctx.doc;
      if (!doc) return { status: 'inert', reason: 'no document' };
      if (jsNodesThisDispatch >= nodeCap) {
        return {
          status: 'inert',
          reason: `dispatch script budget exhausted (${nodeCap} JS nodes)`,
        };
      }
      jsNodesThisDispatch += 1;
      const source = actionCtx.source;
      const pon =
        source.kind === 'widget'
          ? source.pon
          : source.kind === 'link' || source.kind === 'annotation'
            ? (source.pon ?? ctx.document()?.pages[0]?.pageObjectNumber)
            : source.kind === 'page'
              ? source.pon
              : ctx.document()?.pages[0]?.pageObjectNumber;
      if (pon === undefined) return { status: 'inert', reason: 'no page to anchor the world on' };
      const diagnose = (diagnostic: ActionDiagnostic): void => diagnosticHook.emit(diagnostic);
      // Print/submit effects are EXTERNAL: the WP/DP wrap runs action trees
      // (which may need their own host transactions) and the submit dataset
      // must be resolved from POST-COMMIT truth — both must run after the
      // transaction releases, still inside this queued dispatch op.
      const pendingExternal: Array<{
        effect: Extract<ScriptUiEffect, { kind: 'print' | 'submitForm' }>;
        phase: 'boot' | 'user';
      }> = [];
      const splitExternal = (output: ScriptOutput, phase: 'boot' | 'user'): ScriptUiEffect[] =>
        output.uiEffects.filter((effect) => {
          if (effect.kind === 'print' || effect.kind === 'submitForm') {
            pendingExternal.push({ effect, phase });
            return false;
          }
          return true;
        });
      const outcome = await scriptHost.transaction<
        { status: 'executed' } | { status: 'failed'; error: string }
      >(async (txn) => {
        let built = await scriptWorldFor(pon);
        const boot = await txn.boot({
          ...built.world,
          event: { kind: 'name-tree-boot', type: 'Doc', name: 'Open' },
        });
        if (boot) {
          // Boot effects belong to this first transaction; a boot fault only
          // degrades (never bricks). Refetch the world afterwards so the run
          // sees post-boot truth.
          await commitScriptOutput(boot, diagnose);
          surfaceScriptResult({
            uiEffects: splitExternal(boot, 'boot'),
            diagnostics: boot.diagnostics,
            ...(boot.error ? { error: boot.error } : {}),
            origin: actionCtx.origin,
            phase: 'boot',
          });
          if (boot.formEffects.length || boot.annotEffects.length) {
            built = await scriptWorldFor(pon);
          }
        }
        const output = await txn.run(node.script, {
          ...built.world,
          event: scriptEventFor(actionCtx, built.snapshot),
        });
        surfaceScriptResult({
          uiEffects: splitExternal(output, 'user'),
          diagnostics: output.diagnostics,
          ...(output.error ? { error: output.error } : {}),
          origin: actionCtx.origin,
          phase: 'user',
        });
        if (output.error) return { status: 'failed', error: output.error.message };
        const failure = await commitScriptOutput(output, diagnose);
        return failure ? { status: 'failed', error: failure } : { status: 'executed' };
      });
      for (const entry of pendingExternal) {
        if (entry.effect.kind === 'print') {
          await firePrintThroughAdapter({ origin: actionCtx.origin, phase: entry.phase }, diagnose);
        } else {
          await performSubmit(intentOfSubmitEffect(entry.effect), actionCtx, diagnose);
        }
      }
      return outcome;
    });
  }

  async function run(tree: PdfActionTree, actionCtx: ActionContext): Promise<ActionDispatchResult> {
    const diagnostics: ActionDiagnostic[] = [];
    const diagnose = (diagnostic: ActionDiagnostic): void => {
      diagnostics.push(diagnostic);
      diagnosticHook.emit(diagnostic);
    };

    // The law: never execute an incomplete tree — not even its root.
    if (tree.incomplete) {
      diagnose({ code: 'incomplete-tree', message: 'refused: the action tree is incomplete' });
      return { status: 'refused', nodes: [], diagnostics };
    }
    if (!tree.root) return { status: 'inert', nodes: [], diagnostics };

    const nodes: ActionNodeResult[] = [];
    // Navigation and external effects are DEFERRED thunks — fired only after
    // every document-lifetime node succeeded, in node order, so navigation
    // can never yank the user away from a failed write.
    const deferred: Array<{ result: ActionNodeResult; fire: () => Promise<void> | void }> = [];
    let documentFailed = false;

    const settle = (
      result: ActionNodeResult,
      outcome: import('./types').ActionExecutorResult,
    ): void => {
      if (outcome.status === 'executed') result.status = 'executed';
      else if (outcome.status === 'inert') {
        result.status = 'inert';
        result.detail = outcome.reason;
        diagnose({ code: 'executor-inert', message: `${result.type}: ${outcome.reason}` });
      } else {
        result.status = 'failed';
        result.detail = outcome.error;
        diagnose({ code: 'executor-failed', message: `${result.type}: ${outcome.error}` });
      }
    };

    // Full ISO (D7): a Hide action SETS/CLEARS the document Hidden state
    // (12.6.4.11) — a real mutation through the OWNING plane's commit sink,
    // authority-gated by the engine like every other write. Widgets are the
    // FORMS plane's visibility (the engine's field-level `setDisplay` —
    // Acrobat's `field.display`; there is no per-widget annotation patch);
    // plain annotations are flag patches through the annotation sink.
    const interpretHide = async (
      node: Extract<PdfActionNode, { type: 'hide' }>,
    ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
      const doc = ctx.doc;
      const display = node.hide ? ('hidden' as const) : ('visible' as const);
      const fieldRefs: Array<{ kind: 'objectNumber'; fieldObjectNumber: number }> = [];
      const annotEntries: AnnotCommitEntry[] = [];
      const names: string[] = [];
      const bareObjectNumbers: number[] = [];
      for (const target of node.targets) {
        if (target.kind === 'objectNumber') bareObjectNumbers.push(target.objectNumber);
        else names.push(target.name);
      }
      if ((names.length || bareObjectNumbers.length) && doc) {
        const snapshot = names.length || bareObjectNumbers.length ? await doc.forms.list() : null;
        for (const name of names) {
          const field = snapshot?.fields.find((candidate) => candidate.name === name);
          if (!field) {
            diagnose({ code: 'unresolved-target', message: `hide: no field named '${name}'` });
            continue;
          }
          fieldRefs.push({ kind: 'objectNumber', fieldObjectNumber: field.fieldObjectNumber });
        }
        for (const objectNumber of bareObjectNumbers) {
          // A bare object number may be a WIDGET (its field's display) or a
          // plain annotation (its own flags) — the forms snapshot decides.
          const owner = snapshot?.fields.find((field) =>
            field.widgets.some((widget) => widget.annotObjectNumber === objectNumber),
          );
          if (owner) {
            fieldRefs.push({ kind: 'objectNumber', fieldObjectNumber: owner.fieldObjectNumber });
          } else {
            annotEntries.push({
              annotObjectNumber: objectNumber,
              patch: { flags: { hidden: node.hide } },
            });
          }
        }
      }
      let failedDetail: string | undefined;
      if (fieldRefs.length) {
        if (!formCommitSink) {
          diagnose({
            code: 'no-commit-sink',
            message: 'hide: no form commit sink registered (form plugin absent)',
          });
          return { status: 'no-executor' };
        }
        const result = await formCommitSink(
          fieldRefs.map((ref) => ({ kind: 'setDisplay', ref, display })),
        );
        const bad = result.results.find(
          (entry) => entry.status === 'failed' || entry.status === 'rejected',
        );
        if (bad) {
          failedDetail = bad.error?.message ?? bad.status;
          diagnose({ code: 'executor-failed', message: `hide: ${failedDetail}` });
        }
      }
      if (annotEntries.length && !failedDetail) {
        if (!annotCommitSink) {
          diagnose({
            code: 'no-commit-sink',
            message: 'hide: no annotation commit sink registered (annotation plugin absent)',
          });
          return { status: 'no-executor' };
        }
        const committed = await annotCommitSink(annotEntries);
        const failed = committed.results.filter((entry) => entry.status === 'failed');
        for (const failure of failed) {
          diagnose({
            code: 'executor-failed',
            message: `hide: annotation ${failure.annotObjectNumber}: ${failure.error ?? 'failed'}`,
          });
        }
        if (failed.length === committed.results.length && failed.length > 0) {
          failedDetail = failed[0]?.error;
        }
      }
      if (failedDetail) return { status: 'failed', detail: failedDetail };
      return { status: 'executed' };
    };

    const interpret = async (node: PdfActionNode, path: number[]): Promise<void> => {
      const result: ActionNodeResult = { path, type: node.type, status: 'blocked' };
      nodes.push(result);
      const decision = decisionFor(node, actionCtx.origin);

      if (decision === 'never' || decision === 'block' || decision === 'report') {
        result.status = 'blocked';
        diagnose({
          code: 'blocked',
          message: `${node.type}: ${decision === 'never' ? 'never executable' : `policy '${decision}' for origin '${actionCtx.origin}'`}`,
        });
        return;
      }
      if (decision === 'unsupported') {
        result.status = 'no-executor';
        return;
      }

      if (node.type === 'hide') {
        // A document mutation now: an earlier document failure skips it, and
        // its failure stops later document work (the §3.9 ordering law).
        if (documentFailed) {
          result.status = 'skipped';
          return;
        }
        const outcome = await interpretHide(node);
        result.status = outcome.status;
        if (outcome.detail) result.detail = outcome.detail;
        if (outcome.status === 'failed') documentFailed = true;
        return;
      }

      if (DOCUMENT_TYPES.has(node.type)) {
        if (documentFailed) {
          result.status = 'skipped';
          return;
        }
        const executor = executors.get(node.type);
        if (!executor) {
          result.status = node.type === 'javascript' ? 'inert' : 'no-executor';
          diagnose({
            code: 'no-executor',
            message: `${node.type}: no executor registered${node.type === 'javascript' ? ' (scripting unavailable)' : ''}`,
          });
          return;
        }
        try {
          settle(result, await executor(node, actionCtx));
        } catch (error) {
          settle(result, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (result.status === 'failed') documentFailed = true;
        return;
      }

      if (node.type === 'submit-form') {
        if (!node.payload) {
          // Older-runtime extraction (pin lag): exactly the pre-payload
          // behavior — recognized-inert, honestly diagnosed.
          result.status = 'inert';
          result.detail = 'submit payload unavailable (older runtime extraction)';
          diagnose({
            code: 'submit-payload-unavailable',
            message: 'submit-form: payload unavailable (older runtime extraction) — node inert',
          });
          return;
        }
        const payload = node.payload;
        // External like print/uri: deferred until every document-lifetime
        // node succeeded — a submission must never carry a half-failed
        // form state.
        result.status = 'skipped'; // provisional until fired
        deferred.push({
          result,
          fire: async () => {
            const outcome = await performSubmit(intentOfPayload(payload), actionCtx, diagnose);
            result.status = outcome.status;
            if (outcome.detail) result.detail = outcome.detail;
          },
        });
        return;
      }

      if (isPrintVerb(node) || node.type === 'uri') {
        // External: adapter-routed, deferred.
        result.status = 'skipped'; // provisional until fired
        deferred.push({
          result,
          fire: async () => {
            if (node.type === 'uri') {
              if (!uiAdapter) {
                result.status = 'no-executor';
                diagnose({ code: 'no-adapter', message: `${node.type}: no UI adapter installed` });
                return;
              }
              uiAdapter.openUri(node.uri, { isMap: node.isMap, origin: actionCtx.origin });
              result.status = 'executed';
              return;
            }
            // The Print verb: WP → adapter (exactly once) → DP, one latch
            // (D3). Authority/adapter/reentrancy verdicts come back as the
            // node's status.
            const outcome = await firePrintThroughAdapter(undefined, diagnose);
            result.status = outcome.status;
            if (outcome.detail) result.detail = outcome.detail;
          },
        });
        return;
      }

      // goto + named page verbs: navigation, executor-routed, deferred.
      result.status = 'skipped'; // provisional until fired
      deferred.push({
        result,
        fire: async () => {
          const executor = executors.get(node.type);
          if (!executor) {
            result.status = 'no-executor';
            diagnose({ code: 'no-executor', message: `${node.type}: no executor registered` });
            return;
          }
          try {
            settle(result, await executor(node, actionCtx));
          } catch (error) {
            settle(result, {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      });
    };

    const walk = async (node: PdfActionNode, path: number[]): Promise<void> => {
      await interpret(node, path);
      for (let index = 0; index < node.next.length; index++) {
        await walk(node.next[index], [...path, index]);
      }
    };
    await walk(tree.root, []);

    if (!documentFailed) {
      for (const entry of deferred) await entry.fire();
    }

    const anyExecuted = nodes.some((node) => node.status === 'executed');
    const anyFailedOrSkipped = nodes.some(
      (node) => node.status === 'failed' || node.status === 'skipped',
    );
    const status: ActionDispatchResult['status'] = anyExecuted
      ? anyFailedOrSkipped
        ? 'partial'
        : 'executed'
      : anyFailedOrSkipped
        ? 'partial'
        : 'inert';
    return { status, nodes, diagnostics };
  }

  /** run + seq + event — the shared per-tree unit (queued by execute; called
   *  inline per step by the queued trigger resolver). */
  const runAndEmit = async (
    tree: PdfActionTree,
    actionCtx: ActionContext,
  ): Promise<ActionDispatchResult> => {
    const result = await run(tree, actionCtx);
    ctx.dispatch({ type: 'ACTIONS_DISPATCHED' });
    actionHook.emit({ ctx: actionCtx, tree, result });
    return result;
  };

  const execute = (tree: PdfActionTree, actionCtx: ActionContext): Promise<ActionDispatchResult> => {
    // BEFORE enqueueing: a real user gesture arms the open-sequence latch
    // (its barrier op then lands ahead of this action in the queue) and
    // resets the cascade budget.
    if (actionCtx.origin === 'user') noteUserActivity();
    return enqueue(() => {
      jsNodesThisDispatch = 0; // D11: one aggregate per dispatch
      return runAndEmit(tree, actionCtx);
    });
  };

  const canExecute = (tree: PdfActionTree, actionCtx: ActionContext): boolean => {
    if (tree.incomplete || !tree.root) return false;
    const decision = decisionFor(tree.root, actionCtx.origin);
    return decision === 'allow' || decision === 'adapter';
  };

  // ── trigger machinery ─────────────────────────────────────────────────

  const triggerEnabled = (trigger: ActionTrigger): boolean => {
    switch (trigger.scope) {
      case 'activate':
        return true; // the Phase-1 core door — never gated
      case 'annotation':
        return config.triggers?.annotation !== false;
      case 'page':
        return config.triggers?.page !== false;
      case 'document':
        return config.triggers?.document !== false;
    }
  };

  /**
   * Per-pon cache of annotations bearing page-lifecycle trees (PO/PC/PV/PI)
   * — the fan-out's read amplifier. Invalidated wholesale on any
   * `annotation.*` document event and on `stream.desynced` (gap events never
   * arrive, so every cached page may be stale); rebuilt lazily per pon.
   */
  type LifecycleAnnot = { ref: AnnotationRef; actions: PdfAnnotationActions };
  const lifecycleCache = new Map<PageObjectNumber, LifecycleAnnot[]>();
  const lifecycleTreesFor = async (pon: PageObjectNumber): Promise<LifecycleAnnot[]> => {
    const hit = lifecycleCache.get(pon);
    if (hit) return hit;
    const doc = ctx.doc;
    if (!doc) return [];
    const { annotations } = await doc.page(pon).annotations.list();
    const bearing = annotations
      .filter(
        (a) =>
          a.actions &&
          (a.actions.pageOpen?.root ||
            a.actions.pageClose?.root ||
            a.actions.pageVisible?.root ||
            a.actions.pageInvisible?.root),
      )
      .map((a) => ({ ref: a.ref, actions: a.actions! }));
    lifecycleCache.set(pon, bearing);
    return bearing;
  };
  {
    // Optional-chained end to end: unit harnesses fake `ctx.doc` without an
    // event stream; a real DocumentHandle always carries one.
    const unsubscribe = ctx.doc?.events?.subscribe((event) => {
      if (event.type.startsWith('annotation.') || event.type === 'stream.desynced') {
        lifecycleCache.clear();
      }
    });
    if (unsubscribe) ctx.cleanup(unsubscribe);
  }

  /**
   * ISO order, verified against 32000-2 Table 197 (2026-09-02): PO "shall be
   * executed after the O action … and the OpenAction entry"; PC "shall be
   * executed before the C action". Rootless trees are skipped (a
   * budget-degraded tree with no root has nothing to walk).
   */
  const planPageSteps = (
    event: 'open' | 'close' | 'visible' | 'invisible',
    pon: PageObjectNumber,
    pageActions: PdfPageActions | undefined,
    lifecycle: LifecycleAnnot[],
  ): Array<{ source: ActionSource; tree: PdfActionTree }> => {
    const pageSource: ActionSource = { kind: 'page', pon };
    const annotSteps = (key: 'pageOpen' | 'pageClose' | 'pageVisible' | 'pageInvisible') =>
      lifecycle
        .filter((a) => a.actions[key]?.root)
        .map((a) => ({
          source: { kind: 'annotation', annotation: a.ref, pon } as ActionSource,
          tree: a.actions[key]!,
        }));
    switch (event) {
      case 'open':
        return [
          ...(pageActions?.open?.root ? [{ source: pageSource, tree: pageActions.open }] : []),
          ...annotSteps('pageOpen'),
        ];
      case 'close':
        return [
          ...annotSteps('pageClose'),
          ...(pageActions?.close?.root ? [{ source: pageSource, tree: pageActions.close }] : []),
        ];
      case 'visible':
        return annotSteps('pageVisible');
      case 'invisible':
        return annotSteps('pageInvisible');
    }
  };

  /** Aggregate step statuses. A step failure never skips its siblings; this
   *  only FOLDS what each step reported. */
  const foldSteps = (
    steps: ActionStepResult[],
    diagnostics: ActionDiagnostic[],
  ): ActionTriggerResult => {
    const statuses = steps.map((s) => s.result.status);
    const status: ActionTriggerResult['status'] =
      steps.length === 0
        ? 'inert'
        : statuses.every((s) => s === 'refused')
          ? 'refused'
          : statuses.every((s) => s === 'inert')
            ? 'inert'
            : statuses.every((s) => s === 'executed')
              ? 'executed'
              : 'partial';
    return { status, steps, diagnostics };
  };

  const runSteps = async (
    steps: Array<{ source: ActionSource; tree: PdfActionTree }>,
    origin: ActionOrigin,
    event: import('./types').ActionTriggerEvent,
    diagnostics: ActionDiagnostic[],
  ): Promise<ActionTriggerResult> => {
    const results: ActionStepResult[] = [];
    for (const step of steps) {
      const result = await runAndEmit(step.tree, { origin, source: step.source, event });
      results.push({ source: step.source, tree: step.tree, result });
    }
    return foldSteps(results, diagnostics);
  };

  /** Everything a trigger needs — reads included — INSIDE the queued op:
   *  submission order is execution order. Never throws. */
  const resolveAndRun = async (trigger: ActionTrigger): Promise<ActionTriggerResult> => {
    const diagnostics: ActionDiagnostic[] = [];
    const diagnose = (diagnostic: ActionDiagnostic): void => {
      diagnostics.push(diagnostic);
      diagnosticHook.emit(diagnostic);
    };
    try {
      const doc = ctx.doc;
      if (!doc) return { status: 'inert', steps: [], diagnostics };
      if (!triggerEnabled(trigger)) {
        diagnose({
          code: 'trigger-disabled',
          message: `${trigger.scope}: trigger family disabled by config`,
        });
        return { status: 'inert', steps: [], diagnostics };
      }
      const origin = originOf(trigger);
      switch (trigger.scope) {
        case 'activate':
        case 'annotation': {
          const event = trigger.scope === 'activate' ? 'activate' : trigger.event;
          const { annotations } = await doc.page(trigger.pon).annotations.list();
          const annotation = annotations.find((candidate) => sameRef(candidate.ref, trigger.ref));
          // ISO Table 197 (verified 2026-09-02): "the A entry, if present,
          // takes precedence over [the /AA U entry]" — a shadowed U tree is
          // silently inert, exactly like an absent one.
          if (event === 'mouseUp' && annotation?.actions?.activate) {
            return { status: 'inert', steps: [], diagnostics };
          }
          const tree = annotation?.actions?.[event];
          if (!tree?.root && !tree?.incomplete) return { status: 'inert', steps: [], diagnostics };
          const source: ActionSource =
            trigger.source ?? { kind: 'annotation', annotation: trigger.ref, pon: trigger.pon };
          return await runSteps([{ source, tree }], origin, eventOf(trigger), diagnostics);
        }
        case 'page': {
          const layout = ctx
            .document()
            ?.pages.find((page) => page.pageObjectNumber === trigger.pon);
          const lifecycle = await lifecycleTreesFor(trigger.pon);
          const steps = planPageSteps(trigger.event, trigger.pon, layout?.actions, lifecycle);
          return await runSteps(steps, origin, eventOf(trigger), diagnostics);
        }
        case 'document': {
          if (trigger.event !== 'open') {
            return await runDocumentEventOp(trigger.event, diagnostics, diagnose);
          }
          if (openFired) {
            diagnose({
              code: 'open-sequence-replayed',
              message: 'document open sequence already fired for this document',
            });
            return { status: 'inert', steps: [], diagnostics };
          }
          openFired = true;
          return await runOpenSequenceOp();
        }
      }
    } catch (error) {
      diagnose({
        code: 'trigger-failed',
        message: `trigger resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { status: 'refused', steps: [], diagnostics };
    }
  };

  const dispatch = (trigger: ActionTrigger): Promise<ActionTriggerResult> => {
    // A user-origin trigger is user activity (latch + cascade reset) — noted
    // BEFORE taking the queue slot, so an armed open sequence runs first.
    if (originOf(trigger) === 'user') noteUserActivity();
    return enqueue(() => {
      jsNodesThisDispatch = 0; // D11: one aggregate per dispatch
      return resolveAndRun(trigger);
    });
  };

  // ── the lifecycle coordinator (document-open barrier + cascade budget) ──
  // Stage owns page truth (reports through reportPageState); this owns WHEN
  // page-lifecycle triggers fire: nothing emits before the §3.9 open
  // sequence has run (or been declared off/headless), and emission is a diff
  // against the last-emitted state — pre-open motion collapses to one open,
  // with no phantom close.
  const CASCADE_CAP = 8;
  let barrierOpen = false;
  let bufferedReport: PageStateReport | null = null;
  let lastEmitted: { currentPon: PageObjectNumber | null; visible: Set<PageObjectNumber> } = {
    currentPon: null,
    visible: new Set(),
  };
  let cascadeRounds = 0;
  let openFired = false;
  let sawUserActivity = false;

  const emitForReport = (report: PageStateReport): void => {
    if (report.cause === 'user') cascadeRounds = 0;
    const nextVisible = new Set(report.visiblePons);
    const changedCurrent = report.currentPon !== lastEmitted.currentPon;
    const leaving = [...lastEmitted.visible].filter((pon) => !nextVisible.has(pon));
    const entering = [...nextVisible].filter((pon) => !lastEmitted.visible.has(pon));
    if (!changedCurrent && leaving.length === 0 && entering.length === 0) return;
    const previousCurrent = lastEmitted.currentPon;
    // Track truth even when suppressed — the budget bounds EMISSION, not state.
    lastEmitted = { currentPon: report.currentPon, visible: nextVisible };
    if (report.cause === 'programmatic') {
      cascadeRounds += 1;
      if (cascadeRounds > CASCADE_CAP) {
        diagnosticHook.emit({
          code: 'cascade-budget',
          message: `page-lifecycle emission suppressed: ${cascadeRounds} consecutive programmatic rounds (cap ${CASCADE_CAP})`,
        });
        return;
      }
    }
    // Canonical order (cross-page order is unspecified by ISO; within a page
    // planPageSteps holds Table 197's PO-after-O / PC-before-C):
    // close(old) → invisible set → visible set → open(new).
    if (changedCurrent && previousCurrent !== null) {
      void dispatch({ scope: 'page', event: 'close', pon: previousCurrent });
    }
    for (const pon of leaving) void dispatch({ scope: 'page', event: 'invisible', pon });
    for (const pon of entering) void dispatch({ scope: 'page', event: 'visible', pon });
    if (changedCurrent && report.currentPon !== null) {
      void dispatch({ scope: 'page', event: 'open', pon: report.currentPon });
    }
  };

  const reportPageState = (report: PageStateReport): void => {
    if (!report.placed) return;
    if (report.cause === 'user') cascadeRounds = 0;
    if (!barrierOpen) {
      bufferedReport = report; // coalesce: only the LATEST pre-open state matters
      return;
    }
    emitForReport(report);
  };

  const releaseBarrier = (fireFallback: boolean): void => {
    barrierOpen = true;
    const report = bufferedReport;
    bufferedReport = null;
    try {
      if (report) {
        emitForReport(report);
      } else if (fireFallback && config.openSequence === 'headless') {
        // §3.9's initial page open falls back to the document's first page
        // ONLY in declared-headless mode (no stage will ever report). In
        // 'auto', the stage report owns the initial open — firing a
        // first-page /O before a restored view reports would be exactly the
        // phantom open the coordinator exists to prevent; a stage-less
        // 'auto' embedder drives page triggers itself or declares headless.
        const first = ctx.document()?.pages[0]?.pageObjectNumber;
        if (first !== undefined) {
          lastEmitted = { currentPon: first, visible: lastEmitted.visible };
          void dispatch({ scope: 'page', event: 'open', pon: first });
        }
      }
    } catch (error) {
      // The barrier is OPEN either way — feeds must never stay buffered.
      diagnosticHook.emit({
        code: 'trigger-failed',
        message: `barrier release failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  /** The §3.9 sequence body — runs INSIDE the queue (via dispatch or the
   *  latch's own enqueue; callers guarantee openFired was set). */
  const runOpenSequenceOp = async (): Promise<ActionTriggerResult> => {
    const diagnostics: ActionDiagnostic[] = [];
    const steps: ActionStepResult[] = [];
    const lifecycleCtx: ActionContext = {
      origin: 'lifecycle',
      source: { kind: 'document' },
      event: { scope: 'document', name: 'open' },
    };
    try {
      const snapshot = await readDocumentActions();
      if (snapshot?.openDestination) {
        // The initial view reuses the whole spine (stage's goto executor,
        // policy included) as a synthesized lifecycle goto.
        const tree: PdfActionTree = {
          root: {
            type: 'goto',
            subtype: 'GoTo',
            destination: snapshot.openDestination,
            next: [],
          },
          incomplete: false,
          warningFlags: 0,
          warnings: [],
        };
        steps.push({
          source: { kind: 'document' },
          tree,
          result: await runAndEmit(tree, lifecycleCtx),
        });
      }
      if (snapshot?.openAction?.root || snapshot?.openAction?.incomplete) {
        steps.push({
          source: { kind: 'document' },
          tree: snapshot.openAction,
          result: await runAndEmit(snapshot.openAction, lifecycleCtx),
        });
      }
    } catch (error) {
      const diagnostic: ActionDiagnostic = {
        code: 'trigger-failed',
        message: `open sequence failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      diagnostics.push(diagnostic);
      diagnosticHook.emit(diagnostic);
    } finally {
      // Release AFTER the document steps, on EVERY path; page-open emission
      // enqueues BEHIND this op (never awaited here — awaiting our own
      // queue self-deadlocks).
      releaseBarrier(true);
    }
    return foldSteps(steps, diagnostics);
  };

  // ── document lifecycle events (Phase 4: WC/WS/DS/WP/DP) ─────────────────

  /**
   * D1's open-ordering law: catalog `OpenAction` may never run AFTER a
   * WillSave/WillPrint/WillClose script. Before the first verb-shaped
   * document event, an armed-but-unfired open sequence runs inline (we are
   * already inside the queue; `runOpenSequenceOp` never enqueues). It does
   * NOT wait for the initial page `/O` — the guarantee is catalog-level.
   */
  const ensureOpenSequenceBeforeDocEvent = async (): Promise<void> => {
    if (openFired || config.openSequence === 'off') return;
    openFired = true;
    await runOpenSequenceOp();
  };

  /**
   * Run ONE catalog lifecycle tree inside the current queue operation —
   * shared by the dispatch path, `runDocumentVerb`, and the print wrapper.
   * Never throws: a read/resolution failure degrades to a diagnostic (a
   * broken script must not cancel the user's save/print — D2).
   */
  const runDocEventTreeSafe = async (
    event: Exclude<DocumentTriggerEvent, 'open'>,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionStepResult | null> => {
    if (config.triggers?.document === false) return null;
    try {
      await ensureOpenSequenceBeforeDocEvent();
      const snapshot = await readDocumentActions();
      const tree = snapshot?.[DOC_EVENT_TREES[event]];
      if (!tree?.root && !tree?.incomplete) return null;
      const actionCtx: ActionContext = {
        origin: 'lifecycle',
        source: { kind: 'document' },
        event: { scope: 'document', name: event },
      };
      return { source: { kind: 'document' }, tree, result: await runAndEmit(tree, actionCtx) };
    } catch (error) {
      diagnose({
        code: 'trigger-failed',
        message: `${event}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  };

  /** The dispatch-path body for a verb-shaped document event. */
  const runDocumentEventOp = async (
    event: Exclude<DocumentTriggerEvent, 'open'>,
    diagnostics: ActionDiagnostic[],
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionTriggerResult> => {
    const step = await runDocEventTreeSafe(event, diagnose);
    return foldSteps(step ? [step] : [], diagnostics);
  };

  /**
   * D3: BOTH adapter print invocations (the Named Print verb; script
   * `doc.print()` effects from the actions plane) go through here — WP →
   * `uiAdapter.print` exactly once → DP, latch reset in `finally`. While
   * the latch is held (including `runDocumentVerb('print')`'s body) a
   * nested request is suppressed with `reentrant-print`. An adapter throw
   * skips DP (the latch still resets) — named deviation: DP otherwise
   * fires when the adapter call RETURNS, since a browser cannot observe
   * dialog completion.
   */
  const firePrintThroughAdapter = async (
    uiContext: { origin: ActionOrigin; phase: 'boot' | 'user' } | undefined,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
    if (docPrintEventActive) {
      diagnose({
        code: 'reentrant-print',
        message: 'print request during a document print event — suppressed (one dialog per request)',
      });
      return { status: 'blocked', detail: 'reentrant print suppressed' };
    }
    if (!allowsPrint()) {
      diagnose({ code: 'blocked', message: 'print: doc.print is not allowed' });
      return { status: 'blocked', detail: 'doc.print is not allowed' };
    }
    if (!uiAdapter) {
      diagnose({ code: 'no-adapter', message: 'print: no UI adapter installed' });
      return { status: 'no-executor', detail: 'no UI adapter installed' };
    }
    docPrintEventActive = true;
    try {
      await runDocEventTreeSafe('will-print', diagnose);
      const adapter = uiAdapter;
      if (!adapter) return { status: 'no-executor', detail: 'UI adapter uninstalled mid-print' };
      if (uiContext) adapter.print(uiContext);
      else adapter.print();
      await runDocEventTreeSafe('did-print', diagnose);
      return { status: 'executed' };
    } finally {
      docPrintEventActive = false;
    }
  };

  const maybeFireOpenSequence = (): void => {
    if (openFired) return;
    if (config.openSequence === 'off') {
      // The sequence never runs, but feeds must not buffer forever.
      openFired = true;
      releaseBarrier(false);
      return;
    }
    if (!uiAdapter && config.openSequence !== 'headless' && !sawUserActivity) return;
    openFired = true;
    void enqueue(() => runOpenSequenceOp());
  };

  const noteUserActivity = (): void => {
    cascadeRounds = 0;
    if (!sawUserActivity) {
      sawUserActivity = true;
      maybeFireOpenSequence();
    }
  };

  // Arm the latch at bringup: fires immediately for 'headless', releases the
  // barrier for 'off', waits for an adapter or user activity for 'auto'.
  maybeFireOpenSequence();

  return {
    execute,
    canExecute,
    dispatch,
    // Sync twin: family enabled ∧ document present (per-tree truth stays
    // per-step in results — resolution is async and never previewed here).
    canDispatch: (trigger) => triggerEnabled(trigger) && ctx.doc !== null,
    setUiAdapter: (adapter): Unsubscribe => {
      uiAdapter = adapter;
      // An adapter arriving is the §3.9 latch's usual release.
      if (adapter) maybeFireOpenSequence();
      return () => {
        // Identity-safe: never wipe a successor installed after us.
        if (uiAdapter === adapter) uiAdapter = null;
      };
    },
    runDocumentVerb: <T>(
      verb: 'save' | 'print',
      operation: () => Promise<T> | T,
    ): Promise<T> =>
      enqueue(async () => {
        jsNodesThisDispatch = 0; // one D11 aggregate for the whole verb op
        const diagnose = (diagnostic: ActionDiagnostic): void => diagnosticHook.emit(diagnostic);
        const before = verb === 'save' ? ('will-save' as const) : ('will-print' as const);
        const after = verb === 'save' ? ('did-save' as const) : ('did-print' as const);
        const body = async (): Promise<T> => {
          // A before-event failure never cancels the user's verb (D2);
          // runDocEventTreeSafe already degrades to diagnostics.
          await runDocEventTreeSafe(before, diagnose);
          // `operation()` throwing skips the after-event and rethrows —
          // no DidSave for a failed save.
          const value = await operation();
          await runDocEventTreeSafe(after, diagnose);
          return value;
        };
        if (verb !== 'print') return body();
        // The print verb holds the D3 latch for its WHOLE body, so a
        // WillPrint/DidPrint script calling doc.print() is suppressed
        // instead of opening a second dialog.
        docPrintEventActive = true;
        try {
          return await body();
        } finally {
          docPrintEventActive = false;
        }
      }),
    prepareClose: (): Promise<ActionTriggerResult> =>
      dispatch({ scope: 'document', event: 'will-close' }),
    setSubmitHandler: (handler): Unsubscribe => {
      submitHandler = handler;
      // Deliberately NOT an open-latch release — that stays the UI
      // adapter's role.
      return () => {
        if (submitHandler === handler) submitHandler = null;
      };
    },
    onAction: actionHook.on,
    onDiagnostic: diagnosticHook.on,
    onScriptDiagnostic: scriptDiagnosticHook.on,
    onScriptError: scriptErrorHook.on,

    registerExecutor: (type, executor): Unsubscribe => {
      if (executors.has(type)) {
        diagnosticHook.emit({
          code: 'duplicate-executor',
          message: `executor for '${type}' replaced (last-wins)`,
        });
      }
      executors.set(type, executor);
      return () => {
        if (executors.get(type) === executor) executors.delete(type);
      };
    },
    registerAnnotCommitSink: (sink): Unsubscribe => {
      annotCommitSink = sink;
      return () => {
        if (annotCommitSink === sink) annotCommitSink = null;
      };
    },
    registerFormCommitSink: (sink): Unsubscribe => {
      formCommitSink = sink;
      return () => {
        if (formCommitSink === sink) formCommitSink = null;
      };
    },
    ...(scriptHost
      ? {
          scriptTransaction: <T>(
            body: (txn: import('@embedpdf/core-acrojs').ScriptTransaction) => Promise<T>,
          ) => scriptHost.transaction(body),
        }
      : {}),
    surfaceScriptResult,
    reportPageState,
    registerSubmitResolver: (resolver): Unsubscribe => {
      submitResolver = resolver;
      return () => {
        if (submitResolver === resolver) submitResolver = null;
      };
    },
  };
}
