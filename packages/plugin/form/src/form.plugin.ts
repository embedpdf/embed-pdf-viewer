import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation';
// Behavior registration lives on the HOST capability (framework/plugin
// surface) — same runtime token, wider type.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/internal';
import { InteractionToken } from '@embedpdf/plugin-interaction';

import { createFormCapability } from './capability';
import { registerFormEffects } from './effects';
import { createPlaceHandler } from './handler';
import { formReducer, initialFormState } from './reducer';
import { FORM_TOOLS, PLACE_TAGS } from './tools';
import { FormToken } from './types';
import type { FormAction, FormCapability, FormPluginOptions, FormState } from './types';

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
  definePlugin<FormState, FormAction, FormCapability>({
    id: 'form',
    token: FormToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [AnnotationToken],
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
    },
  });
