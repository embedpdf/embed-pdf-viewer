/**
 * Group membership — the pure, model-level view of an annotation group.
 *
 * A group is a primary annotation plus its subordinate members. Persistence is
 * the engine's `/IRT` + `/RT /Group` relationship; in the model a subordinate
 * carries `group = <primary's id>` (its `refKey`). The primary is NOT stamped —
 * it is simply the annotation whose `id` equals the group key, so membership is
 * the set of annotations pointing at it plus the primary itself.
 *
 * ATTACHED LINK CHILDREN are the exception: they ride the same `/RT /Group`
 * wire mechanism but are NOT part of the composite visual — they're substrate
 * plumbing (the parent's link property). They never count as members here, so
 * a linked square still selects as a SINGLE annotation with handles, never
 * shows Ungroup, and the ungroup verb can never strip an attached link's
 * `/IRT` (which would orphan it into an unmanaged standalone document link).
 */
import { capsFor } from './kinds';
import { annotTransformable } from './flags';
import { effBearer } from './session';
import { isAttachedLink } from './plane';
import type { Annot, Id, Model } from './types';

/** A subordinate that counts toward a VISUAL group (not link plumbing). */
const visualMember = (a: Annot | undefined): boolean => !!a && !isAttachedLink(a);

/**
 * The transform capabilities of a multi-target (group) selection: a group can
 * move/resize/rotate only if EVERY member's kind allows that group op AND no
 * member is locked. This is the SINGLE resolver every adapter consumes (v2
 * duplicated the `.every(...)` across three framework components). The iso-vs-
 * aniso resize choice is computed separately, per-gesture, since it depends on
 * the live `rot` of the members, not the static caps.
 */
export interface GroupCaps {
  movable: boolean;
  resizable: boolean;
  rotatable: boolean;
}

export function groupCaps(m: Model, ids: Id[]): GroupCaps {
  const members = ids.map((id) => m.byId[id]).filter((a): a is NonNullable<typeof a> => !!a);
  if (members.length === 0) return { movable: false, resizable: false, rotatable: false };
  const ok = (pick: (c: ReturnType<typeof capsFor>) => boolean): boolean =>
    members.every((a) => annotTransformable(effBearer(m, a)) && pick(capsFor(a.subtype)));
  return {
    movable: ok((c) => c.groupMovable),
    resizable: ok((c) => c.groupResizable),
    rotatable: ok((c) => c.groupRotatable),
  };
}

/**
 * The key of the group `id` belongs to, or `null` when it is ungrouped. A
 * subordinate's key is its `group` field; a primary's key is its own id (it is
 * the target of at least one member's `group`). An annotation that is neither a
 * subordinate nor the target of any subordinate is ungrouped.
 */
export function groupKeyOf(m: Model, id: Id): Id | null {
  const a = m.byId[id];
  if (!a) return null;
  if (a.group) return isAttachedLink(a) ? null : a.group;
  for (const other of m.order) {
    const sub = m.byId[other];
    if (sub?.group === id && visualMember(sub)) return id;
  }
  return null;
}

/**
 * Every member of the group containing `id` (primary first), or just `[id]`
 * when it is ungrouped. The primary is the annotation whose id is the key; the
 * rest are everything whose `group` equals the key, in `order`.
 */
export function groupMembers(m: Model, id: Id): Id[] {
  const key = groupKeyOf(m, id);
  if (key == null) return [id];
  const members: Id[] = [];
  if (m.byId[key]) members.push(key);
  for (const other of m.order) {
    const sub = m.byId[other];
    if (other !== key && sub?.group === key && visualMember(sub)) members.push(other);
  }
  return members;
}

/** Union of every id's full group — the selection seen as whole groups. */
export function expandGroups(m: Model, ids: Id[]): Id[] {
  const out: Id[] = [];
  const seen = new Set<Id>();
  for (const id of ids) {
    for (const member of groupMembers(m, id)) {
      if (!seen.has(member)) {
        seen.add(member);
        out.push(member);
      }
    }
  }
  return out;
}
