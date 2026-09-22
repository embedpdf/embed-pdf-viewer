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

import type { FormCommitResult, WidgetActivationResult } from '../contract';
import type { FormHostCapability } from '../host-contract';
import { fieldForWidget } from '../model';
import { widgetObjectOf } from '../read/fields';
import type { FormContext, FormServices } from '../services';

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
  services: Pick<FormServices, 'fields' | 'siblings' | 'scripting' | 'enqueue'>,
) {
  const { fields, enqueue } = services;
  const annotationHost = services.siblings.annotation;
  const scripting = services.scripting.controller;
  const surfaceViaActions = services.scripting.surface;

  const annotationActivation = async (ref: AnnotationRef) => {
    const loaded = annotationHost?.getRaw(ref);
    if (loaded?.subtype === 'widget') return loaded.actions?.activate ?? null;
    const { annotations } = await ctx.doc.page(ref.page).annotations.list();
    const annotation = annotations.find((candidate) => sameAnnotationRef(candidate.ref, ref));
    return annotation?.subtype === 'widget' ? (annotation.actions?.activate ?? null) : null;
  };

  const activateThroughScripts = async (
    ref: FormFieldRef,
    annotationRef: AnnotationRef,
  ): Promise<FormCommitResult> => {
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
    return result;
  };

  // ── widget DOM-event feed helpers ───────────────────────────────────────
  const widgetSource = (field: FormFieldRef, annotationRef: AnnotationRef): ActionSource => ({
    kind: 'widget',
    field,
    annotation: annotationRef,
    page: annotationRef.page,
  });

  /**
   * One shared hover pump (an exit and the next enter delivered as one
   * ordered pair; intermediate hovers skipped), created on first use.
   */
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
        const field = fieldForWidget(fields.get(), widgetObjectOf(annotationRef));
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
          result: await enqueue(() => activateThroughScripts(field.ref, annotationRef)),
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
          // Check for an enter/exit action tree through the annotation plugin
          // when it is present, so a widget without one costs no dispatch.
          // Without the annotation plugin the flags stay unknown and the
          // dispatcher resolves them in its queue.
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
        // Down, up, focus and blur are fire-and-forget: dispatch never
        // rejects, the dispatcher's queue orders them, and results surface
        // through the actions events. The dispatcher also applies the rule
        // that /A shadows the up event (ISO 32000-2 Table 197).
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
