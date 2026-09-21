import { definePlugin } from '@embedpdf/core';
import { InteractionToken, type InteractionConfig, type Tool } from './contract';
import { createInteractionController } from './controller';
import {
  initialInteractionState,
  reduceInteraction,
  type InteractionAction,
  type InteractionState,
} from './model';
import type { InteractionHostCapability } from './host-contract';

/**
 * The two built-in tools. Features ADD tools via `registerTool`. `enables`
 * is the composition seam:
 *   pointer → text selection + annotation editing + marquee selection
 *   pan     → scrolling (contributed by Stage) + annotation editing, NO text select
 * Both carry `form-fill` and `link-nav`: filling forms and following links is
 * the resting state of a viewer (Acrobat's hand tool does both).
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
    gapCursor: 'grab',
    enables: new Set(['scroll', 'annotation-edit', 'form-fill', 'link-nav']),
  },
];

/**
 * The interaction hub — document-scoped, depends on nothing. Feature plugins
 * `require` this token; the Stage `optional`-ly contributes a scroll handler.
 */
export const interactionPlugin = (config: InteractionConfig = {}) =>
  definePlugin<InteractionState, InteractionAction, InteractionHostCapability>({
    id: 'interaction',
    token: InteractionToken as never,
    scope: 'document',
    initialState: () => initialInteractionState(config),
    reduce: reduceInteraction,
    create: (ctx) => createInteractionController(ctx, builtinTools(), config.tools ?? []),
  });
