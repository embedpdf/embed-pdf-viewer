/**
 * The effect runners: how a change the user makes with a gesture or a
 * selection verb reaches the engine. Each turns one core effect into one
 * engine write and touches no state; the intents service runs the write and
 * settles the pending changes it carries (services/intents.ts).
 *
 * A write to a record runs through `identity.withRef`, so an edit or a
 * delete of a record the engine has not confirmed yet is written after its
 * create, against the real ref.
 *
 * The text runner lives with text editing, the link runner with links, and
 * the capture runner with creation drafts.
 */
import { linkChildrenOf } from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationDraft,
  type AnnotationPatch,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

import { toCreateDraft, toScopedPatch } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { LinkWrites } from './links';
import { named } from './named';

export function registerEffectRunners(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store, geometry, identity }: Pick<AnnotationServices, 'store' | 'geometry' | 'identity'>,
  links: Pick<LinkWrites, 'scheduleSync'>,
): void {
  // A new record: written with a fresh /NM, matched back to its id by that name.
  store.onEffect('create', (effect, model) => {
    const record = model.byId[effect.id];
    const crop = record && geometry.cropOf(record.page.pageObjectNumber);
    const draft = record && crop ? toCreateDraft(record, crop) : null;
    if (!record || !draft) return;
    const create = named(draft);
    identity.expect(create.nm, effect.id);
    return {
      ids: [effect.id],
      perform: async () => {
        try {
          const { annotation: created } = await ctx.doc
            .page(record.page)
            .annotations.create(create);
          identity.confirm(effect.id, created.ref);
          return { [effect.id]: created.ref };
        } catch (error) {
          identity.abandon(effect.id);
          throw error;
        }
      },
    };
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
        (record) => !record || record.page.pageObjectNumber !== primary.page.pageObjectNumber,
      )
    ) {
      return;
    }
    const crop = geometry.cropOf(primary.page.pageObjectNumber);
    const drafts = records.map((record) => (record && crop ? toCreateDraft(record, crop) : null));
    if (drafts.some((draft) => !draft)) return;
    const creates = drafts.map((draft) => named(draft!));
    ids.forEach((id, index) => identity.expect(creates[index]!.nm, id));
    return {
      ids,
      perform: async () => {
        const page = ctx.doc.page(primary.page);
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
          return Object.fromEntries(written.map(({ id, ref }) => [id, ref]));
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

  // The part of a record the gesture changed (its geometry, or the props it restyled).
  store.onEffect('patch', (effect, model) => {
    const record = model.byId[effect.id];
    const crop = record && geometry.cropOf(record.page.pageObjectNumber);
    const patch = record && crop ? toScopedPatch(record, effect.scope, crop) : null;
    if (!record || !patch) return;
    return {
      ids: [effect.id],
      perform: () =>
        identity.withRef(effect.id, async (ref) => {
          await ctx.doc.page(ref.page).annotations.update(ref, patch);
          // Attached link children follow their parent's written geometry.
          const parent = annotationKey(ref);
          if (linkChildrenOf(store.model(), parent).length) {
            void links.scheduleSync(parent, 'keep');
          }
        }),
    };
  });

  // A `/F`-only write: the full merged flags, which never change an appearance.
  store.onEffect('flags', (effect, model) => {
    const record = model.byId[effect.id];
    if (!record) return;
    const patch = {
      subtype: record.data?.subtype ?? record.subtype,
      ...record.flags,
    } as AnnotationPatch;
    return {
      ids: [effect.id],
      perform: () =>
        identity.withRef(effect.id, async (ref) => {
          await ctx.doc.page(ref.page).annotations.update(ref, patch);
        }),
    };
  });

  store.onEffect('delete', (effect) => ({
    ids: [effect.id],
    perform: () =>
      identity.withRef(effect.id, async (ref) => {
        await ctx.doc.page(ref.page).annotations.delete(ref);
      }),
  }));
}
