import { definePlugin } from '@embedpdf/react/runtime';
import { InteractionToken } from '@embedpdf/react/interaction';

/**
 * Example-only: register the insert / redact authoring tools as INERT
 * interaction tools. v3 doesn't yet ship signature or redaction plugins, but
 * this is a CHROME demo — its job is selection state and layout, not the
 * tool's effect. Registering them as real (behaviourless) tools lets every
 * tool button in every mode band go through the SAME path
 * (`InteractionToken.activateTool`), so `active` is uniform and honest: the
 * button really is the active tool; it just has no handler behind it.
 *
 * The annotate + shapes tools are NOT here — those are real tools the
 * annotation plugin registers (highlight, ink, square, circle, …) — and
 * neither are the form palette tools (the form plugin's draw-to-place).
 */
const INERT_TOOLS: ReadonlyArray<{ id: string; cursor: string }> = [
  // insert mode (redact is REAL now — plugin-annotation ships the composed
  // tool and plugin-redaction the destructive apply)
  { id: 'signature', cursor: 'copy' },
  { id: 'image', cursor: 'copy' },
];

export const demoToolsPlugin = () =>
  definePlugin({
    id: 'demo-tools',
    scope: 'document',
    requires: [InteractionToken],
    init: (ctx) => {
      const interaction = ctx.get(InteractionToken);
      for (const tool of INERT_TOOLS) {
        // No `enables` → no gesture/handler wakes up: the tool is selectable
        // (cursor + active state) but behaviourless. Exactly what a chrome demo
        // needs from form/redact/signature tools v3 doesn't ship yet.
        interaction.registerTool({ id: tool.id, cursor: tool.cursor, enables: new Set<string>() });
      }
    },
  });
