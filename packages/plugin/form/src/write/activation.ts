/**
 * Widget activation and the widget DOM-event feed into the actions plane.
 * A click first offers the widget's `/A` tree to the dispatcher; only a
 * tree-less widget falls back to the form's own scripted activation.
 */
import { PluginError } from '@embedpdf/core';
import {
  pageRefsEqual,
  type AnnotationRef,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';
import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
import type { ActionSource } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult, WidgetActivationResult, WidgetAddress } from '../contract';
import { fieldForWidget as coreFieldForWidget } from '../core/model';
import type { FormHostCapability } from '../host-contract';
import type { FormContext, FormServices } from '../services';
import type { FormHydration } from '../sync/hydration';

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

export function createActivation(
  ctx: FormContext,
  services: Pick<FormServices, 'store' | 'siblings' | 'scripting' | 'enqueue'>,
  hydration: FormHydration,
  fields: { widgetObjectOf(widget: WidgetAddress): number },
) {
  const { model } = services.store;
  const annotationHost = services.siblings.annotation;
  const scripting = services.scripting.controller;
  const surfaceViaActions = services.scripting.surface;
  const enqueueMutation = services.enqueue;
  const { refresh } = hydration;
  const { widgetObjectOf } = fields;

  const annotationActivation = async (ref: AnnotationRef) => {
    const doc = ctx.doc;
    if (!doc) return null;
    const loaded = annotationHost?.getRaw(ref);
    if (loaded?.subtype === 'widget') return loaded.actions?.activate ?? null;
    const { annotations } = await doc.page(ref.page).annotations.list();
    const annotation = annotations.find((candidate) => sameAnnotationRef(candidate.ref, ref));
    return annotation?.subtype === 'widget' ? (annotation.actions?.activate ?? null) : null;
  };

  const activateThroughScripts = async (
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

  return {
    api: {
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
            result.status === 'inert' &&
            result.steps.length === 0 &&
            result.diagnostics.length === 0;
          if (!noTree) return { kind: 'dispatched', result };
        }
        return {
          kind: 'form',
          result: await enqueueMutation(() => activateThroughScripts(field.ref, annotationRef)),
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
    } satisfies Partial<FormHostCapability>,
  };
}
