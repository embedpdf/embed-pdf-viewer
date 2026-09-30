/**
 * The effect runners and the stated-change writer: how a change reaches the
 * engine, whichever door it came through (a gesture or a selection verb's core
 * effect, or a change stated in code with `store.apply`). Each turns one change
 * into one engine write and touches no state; the intents service runs the
 * write and settles the pending changes it carries (services/intents.ts). An
 * update is written the same way from both doors, and attached link children
 * follow it.
 *
 * A write to a record runs through `identity.withRef`, so an edit or a
 * delete of a record the engine has not confirmed yet is written after its
 * create, against the real ref.
 *
 * The text runner lives with text editing, the link runner with links, and
 * the capture runner with creation drafts.
 */
import { linkChildrenOf, type Id } from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationResources,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationContext, AnnotationServices } from '../services';
import type { IntentWrite } from '../services/intents';
import type { LinkWrites } from './links';
import { named } from './named';

export function registerEffectRunners(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store, geometry, identity }: Pick<AnnotationServices, 'store' | 'geometry' | 'identity'>,
  links: Pick<LinkWrites, 'scheduleSync'>,
): void {
  /** A new record: written under its name, matched back to its id by that name. */
  const createWrite = (
    id: Id,
    page: PageRef,
    draft: AnnotationDraft,
    resources?: AnnotationResources,
  ): IntentWrite => {
    const create = named(draft);
    identity.expect(create.nm, id);
    return {
      ids: [id],
      perform: async () => {
        try {
          const { annotation: created } = await ctx.doc
            .page(page)
            .annotations.create(create, resources);
          identity.confirm(id, created.ref);
          return { created: { [id]: created.ref }, annotation: created };
        } catch (error) {
          identity.abandon(id);
          throw error;
        }
      },
    };
  };

  /** One record's patch, and any new bytes, written; attached link children follow it. */
  const updateWrite = (
    id: Id,
    patch: AnnotationPatch,
    resources?: AnnotationResources,
  ): IntentWrite => ({
    ids: [id],
    perform: () =>
      identity.withRef(id, async (ref) => {
        const { annotation } = await ctx.doc
          .page(ref.page)
          .annotations.update(ref, patch, resources);
        const parent = annotationKey(ref);
        if (linkChildrenOf(store.model(), parent).length) {
          void links.scheduleSync(parent, 'keep');
        }
        return { annotation };
      }),
  });

  const deleteWrite = (id: Id): IntentWrite => ({
    ids: [id],
    perform: () =>
      identity.withRef(id, async (ref) => {
        await ctx.doc.page(ref.page).annotations.delete(ref);
      }),
  });

  store.onApply((change, id) =>
    change.type === 'create'
      ? createWrite(id, change.page, change.draft, change.resources)
      : change.type === 'update'
        ? updateWrite(id, change.patch, change.resources)
        : deleteWrite(id),
  );

  // A drawn record: written from the draft its annotation was predicted from.
  store.onEffect('create', (effect, model) => {
    const record = model.byId[effect.id];
    if (!record) return;
    return createWrite(effect.id, record.annotation.page, effect.draft);
  });

  // A composite (a replace-text caret and its strikeout): the primary first,
  // then each member pointing at it. A PDF write is not transactional, so a
  // failure deletes what was written, in reverse; a part whose delete fails
  // stays, because the view must match the document.
  store.onEffect('createGroup', (effect, model) => {
    const ids = [effect.primary, ...effect.members];
    const records = ids.map((id) => model.byId[id]);
    const primary = records[0];
    if (
      !primary ||
      records.some(
        (record) =>
          !record || record.annotation.page.objectNumber !== primary.annotation.page.objectNumber,
      )
    ) {
      return;
    }
    const creates = ids.map((id) => named(effect.drafts[id]!));
    ids.forEach((id, index) => identity.expect(creates[index]!.nm, id));
    return {
      ids,
      perform: async () => {
        const page = ctx.doc.page(primary.annotation.page);
        const written: { id: string; ref: AnnotationRef }[] = [];
        try {
          for (const [index, id] of ids.entries()) {
            const draft: AnnotationDraft =
              index === 0
                ? creates[0]!
                : ({
                    ...creates[index]!,
                    reply: { to: written[0]!.ref, type: 'group' },
                  } as AnnotationDraft);
            const { annotation: created } = await page.annotations.create(draft);
            identity.confirm(id, created.ref);
            written.push({ id, ref: created.ref });
          }
          return { created: Object.fromEntries(written.map(({ id, ref }) => [id, ref])) };
        } catch (error) {
          for (const part of [...written].reverse()) {
            await page.annotations.delete(part.ref).catch(() => {});
          }
          ids.forEach(identity.abandon);
          throw error;
        }
      },
    };
  });

  // What a record's change means to the engine, as the core worked it out:
  // the same patch its pending change holds.
  store.onEffect('patch', (effect) => updateWrite(effect.id, effect.patch));

  store.onEffect('delete', (effect) => deleteWrite(effect.id));
}
