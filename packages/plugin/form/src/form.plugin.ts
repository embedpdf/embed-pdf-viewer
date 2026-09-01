import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
// Executor registration lives on the actions HOST capability — same runtime
// token, wider type (the annotation-internal precedent).
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
// Behavior registration lives on the HOST capability (framework/plugin
// surface) — same runtime token, wider type.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import { createFormCapability } from './capability';
import { registerFormEffects } from './effects';
import { createPlaceHandler } from './handler';
import { formReducer, initialFormState } from './reducer';
import { FORM_TOOLS, PLACE_TAGS } from './tools';
import { FormToken } from './types';
import type { FormAction, FormHostCapability, FormPluginOptions, FormState } from './types';

/**
 * The form plugin: the FIELD plane. Document-scoped; requires the
 * interaction hub. Fill mode works with no annotation plugin at all —
 * geometry is read from the engine's widget DTOs. When the annotation
 * plugin IS present, a Behavior keeps widgets geometry-inert while the
 * active tool carries 'form-fill' (the built-in pointer/pan tools do, so
 * filling is the resting state) and stands the fill controls down under
 * every other tool — the single-active-tool hub IS the mode switch.
 * Design mode = the 'form-edit' / palette tools: no 'form-fill' tag, so
 * widgets become ordinary editable annotations.
 */
export const formPlugin = (options: FormPluginOptions = {}) =>
  definePlugin<FormState, FormAction, FormHostCapability>({
    id: 'form',
    token: FormToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [AnnotationToken, ActionsToken],
    initialState: initialFormState,
    reduce: formReducer,
    capability: (ctx) => createFormCapability(ctx, options),
    effects: registerFormEffects,
    init: (ctx) => {
      const interaction = ctx.get(InteractionToken);
      const form = ctx.get(FormToken);
      // Fill-ONLY mode: forms fillable, no annotation editing at all. The
      // DEFAULT fill experience doesn't need this tool — the built-in
      // pointer/pan tools carry the 'form-fill' tag themselves.
      interaction.registerTool({
        id: 'form-fill',
        cursor: 'default',
        // `link-nav` rides along: links keep navigating while a form is being
        // filled (Acrobat behaviour) — inert without the link plugin.
        enables: new Set(['form-fill', 'link-nav']),
      });
      // Design mode's resting state (the Form tab): no 'form-fill', so the
      // widget Behavior disengages and widgets select/move/resize like any
      // annotation. Palette tools layer drag-to-place on top of this.
      interaction.registerTool({
        id: 'form-edit',
        cursor: 'default',
        enables: new Set(['annotation-edit', 'annotation-marquee']),
      });
      // Field palette: ONE tool table, two registration paths. With the
      // annotation plugin, palette tools join ITS registry — they gain live
      // defaults, the schema style panel (`propsForTool`), click-create — all
      // the shared authoring infrastructure. Without it,
      // the same table registers plain hub tools: drag/click placement and
      // programmatic authoring still work (`placeField` is a pure `doc.forms`
      // call); only INTERACTIVE styling/moving needs the annotation plane.
      // Either way the commit goes through the form place handler — these
      // tools enable 'form-place', never 'annotation-draw', so the two commit
      // planes can't cross structurally.
      const annotation = ctx.tryGet(AnnotationHostToken);
      for (const t of FORM_TOOLS) {
        if (annotation) {
          annotation.registerTool({
            id: t.id,
            subtype: t.visualKind,
            cursor: t.cursor,
            enables: [...PLACE_TAGS],
            clickCreate: t.clickCreate,
            defaults: t.defaults,
          });
        } else {
          interaction.registerTool({
            id: t.id,
            cursor: t.cursor,
            enables: new Set(PLACE_TAGS),
          });
        }
      }
      interaction.registerHandler(createPlaceHandler(form, interaction, annotation));

      if (annotation) {
        annotation.registerBehavior({
          id: 'form-widgets',
          matches: (a) => a.subtype.startsWith('widget'),
          engaged: () => interaction.activeTool()?.enables.has('form-fill') ?? false,
        });
      }

      // ── interim Phase-1 action executors ────────────────────────────────
      // The registry is the phasing seam: Phase 3's shared ScriptHost swaps
      // in by re-registering 'javascript' (last-wins). Lazy self-resolution
      // on purpose — executors run post-bringup against the kernel's
      // memoized capability, so the closure-held scripting controller exists
      // exactly when needed.
      const actions = ctx.tryGet(ActionsHostToken);
      if (actions) {
        // The real `javascript` executor is the actions plugin's own (Phase 3
        // ScriptHost); form contributes its DOCUMENT-commit sink so script
        // form effects land through the owner (engine write + model
        // reconciliation in one place — the stale-model class is structural).
        ctx.cleanup(
          actions.registerFormCommitSink((effects) => {
            const formHost = ctx.tryGet(FormToken);
            if (!formHost) {
              return Promise.resolve({
                results: effects.map((_, index) => ({
                  index,
                  status: 'failed' as const,
                  fields: [],
                  changedWidgets: [],
                })),
                changedWidgets: [],
                meta: null,
              });
            }
            return formHost.commitScriptFormEffects(effects);
          }),
        );
        ctx.cleanup(
          actions.registerExecutor('reset-form', async (node) => {
            if (node.type !== 'reset-form') {
              return { status: 'inert', reason: 'not a reset-form node' };
            }
            const formHost = ctx.tryGet(FormToken);
            if (!formHost) return { status: 'inert', reason: 'form plugin unavailable' };
            const result = await formHost.resetFormAction(node.fields, node.exclude);
            if (result.status === 'failed') {
              return { status: 'failed', error: result.error?.message ?? 'reset failed' };
            }
            if (result.effectsResult === null) {
              return {
                status: 'inert',
                reason: result.diagnostics[0]?.message ?? 'reset-form resolved no fields',
              };
            }
            return { status: 'executed' };
          }),
        );
      }
    },
  });
