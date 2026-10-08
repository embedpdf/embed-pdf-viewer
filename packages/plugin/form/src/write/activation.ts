/**
 * Widget activation and the widget DOM-event feed into the actions plane.
 * A click first offers the widget's `/A` tree to the dispatcher; only a
 * tree-less widget falls back to the form's own scripted activation.
 */
import { PluginError } from '@embedpdf/core';
import { type AnnotationRef, type FormFieldRef } from '@embedpdf/engine-core/runtime';
import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
import type { ActionSource } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult, WidgetActivationResult } from '../contract';
import type { FormHostCapability } from '../host-contract';
import { fieldForWidget, widgetRowOf } from '../model';
import { widgetObjectOf } from '../read/fields';
import type { FormContext, FormServices } from '../services';

export function createActivation(
  ctx: FormContext,
  services: Pick<FormServices, 'fields' | 'siblings' | 'scripting' | 'enqueue'>,
) {
  const { fields, enqueue, scripting } = services;

  /** The widget's activation action, from its row in the form. */
  const annotationActivation = async (ref: AnnotationRef) => {
    await fields.settled();
    const row = ref.kind === 'objectNumber' ? widgetRowOf(fields.get(), ref.objectNumber) : null;
    return row?.actions?.activate ?? null;
  };

  const activateThroughScripts = async (
    ref: FormFieldRef,
    annotationRef: AnnotationRef,
  ): Promise<FormCommitResult> => {
    const pipeline = scripting.controller();
    if (!pipeline) {
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
    const result = await pipeline.activate(ref, action);
    scripting.surface(result, 'user');
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
    const row =
      annotationRef.kind === 'objectNumber'
        ? widgetRowOf(fields.get(), annotationRef.objectNumber)
        : null;
    if (!row) return null;
    return {
      enter: Boolean(row.actions?.cursorEnter?.root),
      exit: Boolean(row.actions?.cursorExit?.root),
    };
  };

  return {
    api: {
      activateWidget: async (annotationRef, options): Promise<WidgetActivationResult> => {
        const field = fieldForWidget(fields.get(), widgetObjectOf(annotationRef));
        if (!field) throw new PluginError('not-found', 'form', 'no form field owns this widget');
        const actions = ctx.tryGet(ActionsToken);
        if (actions) {
          const result = await ctx.cancellable(
            options?.signal,
            actions.dispatch({
              scope: 'activate',
              ref: annotationRef,
              page: annotationRef.page,
              source: widgetSource(field.ref, annotationRef),
            }),
          );
          const noTree =
            result.status === 'inert' &&
            result.steps.length === 0 &&
            result.diagnostics.length === 0;
          if (!noTree) return { kind: 'dispatched', result };
        }
        return {
          kind: 'form',
          result: await enqueue(
            () =>
              ctx.cancellable(options?.signal, activateThroughScripts(field.ref, annotationRef)),
            options,
          ),
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
