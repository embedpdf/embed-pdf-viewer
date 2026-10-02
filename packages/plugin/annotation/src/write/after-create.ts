/**
 * What happens after a tool creates an annotation (the `afterCreate` setting,
 * and a tool's own over it): whether the new annotation is selected, whether a
 * new text box opens for typing, and whether the tool stays active. Code that
 * creates never selects unless it asks (`create(…, { select: true })`), so
 * this applies only to what a tool makes.
 */
import type { Id, UpdateResult } from '@embedpdf/core-annotation';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import type { AfterCreateSettings } from '../contract';
import type { AnnotationContext, AnnotationServices } from '../services';

/** The records a message created. */
const createdIds = (result: UpdateResult): Id[] =>
  result.effects.flatMap((effect) =>
    effect.type === 'create'
      ? [effect.id]
      : effect.type === 'createGroup'
        ? [effect.primary, ...effect.members]
        : [],
  );

export function createAfterCreate(
  ctx: Pick<AnnotationContext, 'tryGet'>,
  { settings, tools, store }: Pick<AnnotationServices, 'settings' | 'tools' | 'store'>,
) {
  /** The policy for a tool: its own `afterCreate` over the setting. */
  const policyOf = (toolId: string | undefined): AfterCreateSettings => ({
    ...settings.get().afterCreate,
    ...(toolId ? tools.get(toolId)?.afterCreate : undefined),
  });

  /**
   * A tool's create, as the policy shows it: the core selects what it made
   * and opens a new text box for typing. Without `editText` the box doesn't
   * open; without `select` nothing is selected, except a box being typed in.
   */
  const shape =
    (toolId: string | undefined) =>
    (result: UpdateResult): UpdateResult => {
      const created = createdIds(result);
      if (!created.length) return result;
      const policy = policyOf(toolId);
      let session = result.session;
      if (!policy.editText && session.editing !== null && created.includes(session.editing)) {
        session = { ...session, editing: null };
      }
      const typing = session.editing !== null && created.includes(session.editing);
      if (!policy.select && !typing) session = { ...session, selected: [] };
      return session === result.session ? result : { ...result, session };
    };

  /** After a tool's create: go back to the default tool when the policy says so. */
  const done = (toolId: string | undefined, result: { effects: readonly { type: string }[] }) => {
    if (!result.effects.some((effect) => effect.type === 'create' || effect.type === 'createGroup'))
      return;
    if (policyOf(toolId).tool !== 'default') return;
    ctx.tryGet(InteractionToken)?.activateDefaultTool();
  };

  /** A click-placed create (a note, a stamp, a file): select it as the policy says, then `done`. */
  const placed = (toolId: string | undefined, ids: readonly Id[]): void => {
    if (policyOf(toolId).select) store.commit({ type: 'select', ids: [...ids] });
    if (policyOf(toolId).tool === 'default') ctx.tryGet(InteractionToken)?.activateDefaultTool();
  };

  return { shape, done, placed };
}

export type AfterCreate = ReturnType<typeof createAfterCreate>;
