/**
 * The form plugin's wiring to its siblings, run once every capability exists:
 * its tools and place handler on the interaction hub, the widget behavior on
 * the annotation plugin, and the reset executor, commit sink and submit
 * resolver on the actions plugin. Every registration is released with the
 * document.
 */
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import type { FormHostCapability } from './host-contract';
import type { FormContext } from './services';
import { FORM_TOOLS, PLACE_TAGS } from './tools/definitions';
import { createPlaceHandler } from './tools/handlers';

export function connectForm(ctx: FormContext, form: FormHostCapability): void {
  const interaction = ctx.get(InteractionToken);
  const annotation = ctx.tryGet(AnnotationHostToken);

  // Fill-only mode: forms are fillable and annotations are not editable. The
  // default fill experience does not need this tool, because the built-in
  // pointer and pan tools carry the 'form-fill' tag themselves. 'link-nav'
  // keeps links navigable while filling, as in Acrobat.
  ctx.cleanup(
    interaction.registerTool({
      id: 'form-fill',
      cursor: 'default',
      enables: new Set(['form-fill', 'link-nav']),
    }),
  );
  // Design mode's resting tool: without 'form-fill' the widget behavior
  // disengages, and widgets select, move and resize like any annotation.
  // Palette tools add drag-to-place on top of it.
  ctx.cleanup(
    interaction.registerTool({
      id: 'form-edit',
      cursor: 'default',
      enables: new Set(['annotation-edit', 'annotation-marquee']),
    }),
  );

  // The field palette is one tool table with two registration paths. With the
  // annotation plugin, the tools join its registry and gain live defaults,
  // the style panel and click-to-create. Without it they are plain hub tools:
  // placement still works; only interactive styling needs the annotation
  // plugin. Either way the form place handler commits them: these tools
  // enable 'form-place', never 'annotation-draw'.
  for (const tool of FORM_TOOLS) {
    ctx.cleanup(
      annotation
        ? annotation.registerTool({
            id: tool.id,
            subtype: tool.visualKind,
            cursor: tool.cursor,
            enables: [...PLACE_TAGS],
            clickCreate: tool.clickCreate,
            defaults: tool.defaults,
          })
        : interaction.registerTool({ id: tool.id, cursor: tool.cursor, enables: new Set(PLACE_TAGS) }),
    );
  }
  ctx.cleanup(interaction.registerHandler(createPlaceHandler(form, interaction, annotation)));

  // Widgets stay inert annotations while the active tool fills forms.
  if (annotation) {
    ctx.cleanup(
      annotation.registerBehavior({
        id: 'form-widgets',
        matches: (record) => record.subtype.startsWith('widget'),
        engaged: () => interaction.getActiveTool()?.enables.has('form-fill') ?? false,
      }),
    );
  }

  const actions = ctx.tryGet(ActionsHostToken);
  if (!actions) return;
  // Script form effects are written through this plugin, which owns the fields.
  ctx.cleanup(actions.registerFormCommitSink((effects) => form.commitScriptFormEffects(effects)));
  ctx.cleanup(
    actions.registerSubmitResolver((intent, actionContext, diagnose) =>
      form.resolveSubmitDataset(intent, actionContext, diagnose),
    ),
  );
  // The executor passes its action context through, so a ResetForm run by a
  // page or document trigger reports its recalculation with that origin.
  ctx.cleanup(
    actions.registerExecutor('reset-form', async (node, actionContext) => {
      if (node.type !== 'reset-form') return { status: 'inert', reason: 'not a reset-form node' };
      const result = await form.resetFormAction(node.fields, node.exclude, actionContext.origin);
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
