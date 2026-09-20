import { definePlugin } from '@embedpdf/react/runtime';
import { InteractionToken } from '@embedpdf/react/interaction';

/**
 * Example-only: register the still-unimplemented authoring tools as INERT
 * interaction tools. v3 doesn't yet ship a signature plugin, but this is a
 * CHROME demo — its job is selection state and layout, not the tool's effect.
 * Registering them as real (behaviourless) tools lets every tool button in
 * every mode band go through the SAME path (`InteractionToken.activateTool`),
 * so `active` is uniform and honest: the button really is the active tool; it
 * just has no handler behind it.
 *
 * Everything else in the Insert band is REAL now: stamps come from the stamp
 * plugin's libraries (armed by the stamps sidebar), and image/attachment are
 * the annotation plugin's click-then-pick tools. The annotate + shapes tools
 * were never here either — nor the form palette (the form plugin's
 * draw-to-place).
 */
const INERT_TOOLS: ReadonlyArray<{ id: string; cursor: string }> = [
  // insert mode (redact is REAL now — plugin-annotation ships the composed
  // tool and plugin-redaction the destructive apply; `image` is a real
  // click-then-pick stamp preset, see viewer.tsx)
  { id: 'signature', cursor: 'copy' },
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
        // needs from the signature tool v3 doesn't ship yet.
        interaction.registerTool({ id: tool.id, cursor: tool.cursor, enables: new Set<string>() });
      }
    },
  });
