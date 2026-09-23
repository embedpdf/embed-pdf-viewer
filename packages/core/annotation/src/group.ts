/**
 * Group membership — the pure, model-level view of an annotation group.
 *
 * A group is a primary annotation plus its subordinate members. Persistence is
 * the engine's `/IRT` + `/RT /Group` relationship; in the model a subordinate
 * carries `group = <primary's id>` (its `refKey`). The primary is not stamped —
 * it is simply the annotation whose `id` equals the group key, so membership is
 * the set of annotations pointing at it plus the primary itself.
 *
 * Attached link children are the exception: they ride the same `/RT /Group`
 * wire mechanism but are not part of the composite visual — they're substrate
 * plumbing (the parent's link property). They never count as members here, so
 * a linked square still selects as a single annotation with handles, never
 * shows Ungroup, and the ungroup verb can never strip an attached link's
 * `/IRT` (which would orphan it into an unmanaged standalone document link).
 */
import { capsFor } from './kinds';
import { annotTransformable } from './flags';
import { isAttachedLink } from './plane';
import type { ModelAnnotation, Id, Model } from './types';

/** A subordinate that counts toward a visual group (not link plumbing). */
const visualMember = (annotation: ModelAnnotation | undefined): boolean =>
  !!annotation && !isAttachedLink(annotation);

/**
 * The transform capabilities of a multi-target (group) selection: a group can
 * move/resize/rotate only if every member's kind allows that group op and no
 * member is locked. This is the single resolver every adapter consumes, so no
 * framework component re-derives the rule. The iso-vs-
 * aniso resize choice is computed separately, per-gesture, since it depends on
 * the live `rot` of the members, not the static caps.
 */
export interface GroupCaps {
  movable: boolean;
  resizable: boolean;
  rotatable: boolean;
}

export function groupCaps(model: Model, ids: Id[]): GroupCaps {
  const members = ids
    .map((id) => model.byId[id])
    .filter((annotation): annotation is NonNullable<typeof annotation> => !!annotation);
  if (members.length === 0) return { movable: false, resizable: false, rotatable: false };
  const ok = (pick: (caps: ReturnType<typeof capsFor>) => boolean): boolean =>
    members.every(
      (annotation) => annotTransformable(annotation) && pick(capsFor(annotation.subtype)),
    );
  return {
    movable: ok((caps) => caps.groupMovable),
    resizable: ok((caps) => caps.groupResizable),
    rotatable: ok((caps) => caps.groupRotatable),
  };
}

/**
 * The key of the group `id` belongs to, or `null` when it is ungrouped. A
 * subordinate's key is its `group` field; a primary's key is its own id (it is
 * the target of at least one member's `group`). An annotation that is neither a
 * subordinate nor the target of any subordinate is ungrouped.
 */
export function groupKeyOf(model: Model, id: Id): Id | null {
  const annotation = model.byId[id];
  if (!annotation) return null;
  if (annotation.group) return isAttachedLink(annotation) ? null : annotation.group;
  for (const other of model.order) {
    const sub = model.byId[other];
    if (sub?.group === id && visualMember(sub)) return id;
  }
  return null;
}

/**
 * Every member of the group containing `id` (primary first), or just `[id]`
 * when it is ungrouped. The primary is the annotation whose id is the key; the
 * rest are everything whose `group` equals the key, in `order`.
 */
export function groupMembers(model: Model, id: Id): Id[] {
  const key = groupKeyOf(model, id);
  if (key == null) return [id];
  const members: Id[] = [];
  if (model.byId[key]) members.push(key);
  for (const other of model.order) {
    const sub = model.byId[other];
    if (other !== key && sub?.group === key && visualMember(sub)) members.push(other);
  }
  return members;
}

/** Union of every id's full group — the selection seen as whole groups. */
export function expandGroups(model: Model, ids: Id[]): Id[] {
  const out: Id[] = [];
  const seen = new Set<Id>();
  for (const id of ids) {
    for (const member of groupMembers(model, id)) {
      if (!seen.has(member)) {
        seen.add(member);
        out.push(member);
      }
    }
  }
  return out;
}
