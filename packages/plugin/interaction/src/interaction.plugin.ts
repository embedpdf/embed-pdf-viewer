import { definePlugin } from '@embedpdf/core';
import { createInteractionCapability } from './capability';
import { initialInteractionState, interactionReducer } from './reducer';
import { InteractionToken } from './types';
import type {
  InteractionAction,
  InteractionCapability,
  InteractionConfig,
  InteractionState,
  Tool,
} from './types';

/**
 * The two built-in tools. Features ADD tools via `registerTool` (a draw tool, a
 * redact tool…). `enables` is the composition seam:
 *   pointer → text selection + annotation editing + annotation marquee selection
 *   pan     → scrolling (contributed by Stage) + annotation editing, NO text select
 *
 * Both carry `form-fill`: filling a form is the RESTING state of a viewer
 * (Acrobat's hand tool fills forms too), so widgets are fill-controls under the
 * default tools and only become geometry-editable under a form-design tool.
 * Both carry `link-nav` for the same reason: links navigate under the default
 * tools (Acrobat behaviour) and only become geometry-editable under the link
 * tool. Tags are opaque to the hub — without the form/link plugins they're inert.
 */
export const builtinTools = (): Tool[] => [
  {
    id: 'pointer',
    cursor: 'default',
    enables: new Set([
      'text-select',
      'annotation-edit',
      'annotation-marquee',
      'form-fill',
      'link-nav',
    ]),
  },
  {
    id: 'pan',
    cursor: 'grab',
    gapCursor: 'grab', // pan works anywhere — the open hand doesn't stop at page edges
    enables: new Set(['scroll', 'annotation-edit', 'form-fill', 'link-nav']),
  },
  // The READING pair — pointer/pan minus authoring. Under these, annotations
  // are CONTENT: text selects, forms fill, links (attached ones included)
  // navigate — nothing selects, moves, or places. Chrome's View mode and its
  // `readOnly` prop ride them; `pointer`/`pan` are these plus editing.
  {
    id: 'view',
    cursor: 'default',
    enables: new Set(['text-select', 'form-fill', 'link-nav']),
  },
  {
    id: 'view-pan',
    cursor: 'grab',
    gapCursor: 'grab',
    enables: new Set(['scroll', 'form-fill', 'link-nav']),
  },
];

/**
 * The interaction hub plugin — document-scoped, depends on nothing. Every feature
 * plugin (selection, annotation, forms, redaction) `requires` this token; Stage
 * `optional`-ly contributes a scroll handler. Works with `<Stage>` or a standalone
 * `<PageView>` — it only routes page-space pointer samples.
 */
export const interactionPlugin = (config: InteractionConfig = {}) =>
  definePlugin<InteractionState, InteractionAction, InteractionCapability>({
    id: 'interaction',
    token: InteractionToken,
    scope: 'document',
    initialState: () => initialInteractionState(config),
    reduce: interactionReducer,
    capability: (ctx) => createInteractionCapability(ctx, builtinTools()),
  });
