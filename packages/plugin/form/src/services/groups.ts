/**
 * The form's groups as people see them. A field's group is an id in the PDF
 * (`groupId`); who the group is and the color its fields show in are the
 * app's, told to this document with `setGroups()`, and never written into the
 * PDF. Every group shows in a color: its own when the app gives one, else one
 * of eight by its place in the list, so no two of the first eight share one.
 * How strongly it shows is the `fields.tint` setting; at `0` no field shows
 * its group at all.
 */
import { memo, PluginError, type Mirror } from '@embedpdf/core';
import type { RecordAccent } from '@embedpdf/core-annotation';

import type { FormGroupsChangedEvent } from '../contract';
import type { FieldIndex, NamedGroup } from '../model';
import type { FormContext } from './context';
import type { FormEvents } from './events';

/** One of the form's groups, as `listGroups()` gives it. */
export interface FormGroup {
  /** The group: the id its fields carry. */
  readonly id: string;
  /** Who the group is, for people; `null` when the app gives it no label. */
  readonly label: string | null;
  /**
   * The color its fields show in, a CSS color: the one the app gave, else one
   * of {@link GROUP_COLORS} by the group's place in the list.
   */
  readonly color: string;
}

/**
 * The colors of the groups the app gives none: the first group in the list
 * gets the first, and the ninth the first again.
 */
export const GROUP_COLORS: readonly string[] = Object.freeze([
  '#ea580c',
  '#16a34a',
  '#9333ea',
  '#2563eb',
  '#db2777',
  '#0d9488',
  '#ca8a04',
  '#65a30d',
]);

/** A field's group as its boxes show it: who it is, and the accent its fields show in. */
export interface GroupLook {
  /** Who the group is, for people; `null` when the app gives it no label. */
  readonly label: string | null;
  /** The group's color and how strongly it shows; `null` while `fields.tint` is `0`. */
  readonly accent: RecordAccent | null;
}

export interface FormGroups {
  /** The groups the app named, in its order, then the other groups the form's fields are in. */
  list(): readonly FormGroup[];
  /**
   * How a group's fields show; `null` for no group. The same object until the
   * groups or the tint change: for memos.
   */
  lookOf(groupId: string | null): GroupLook | null;
  /**
   * Whether the session may put a field in this group: it may design the form, and the group is
   * its own or one a `fields:set-group` permission names. The engine's own answer.
   */
  maySet(groupId: string): boolean;
  /** Refuse putting a field in a group the session may not, naming the permission it takes. */
  assertMaySet(groupId: string, operation: string): void;
}

const MODIFY = 'doc.forms.modify';

const NO_LOOKS: ReadonlyMap<string, GroupLook> = new Map();

export function createGroups(
  ctx: FormContext,
  fields: Mirror<FieldIndex>,
  events: Pick<FormEvents, 'groupsChanged'>,
): FormGroups {
  /** The ids of the groups the form's fields are in, in the fields' order, as one key. */
  const used = (): string => {
    const ids = new Set<string>();
    for (const field of fields.view().snapshot?.fields ?? []) {
      if (field.groupId !== null) ids.add(field.groupId);
    }
    return JSON.stringify([...ids]);
  };

  const list = memo(
    () => [ctx.state.get().groups, used()] as const,
    (named, ids): readonly FormGroup[] => {
      const known = new Set(named.map((group) => group.id));
      const others = (JSON.parse(ids) as string[])
        .filter((id) => !known.has(id))
        .map((id): NamedGroup => ({ id, label: null, color: null }));
      return Object.freeze(
        [...named, ...others].map(
          (group, place): FormGroup =>
            Object.freeze({
              id: group.id,
              label: group.label,
              color: group.color ?? GROUP_COLORS[place % GROUP_COLORS.length]!,
            }),
        ),
      );
    },
  );

  const looks = memo(
    () => [list(), ctx.settings().get().fields.tint] as const,
    (groups, strength): ReadonlyMap<string, GroupLook> =>
      groups.length === 0
        ? NO_LOOKS
        : new Map(
            groups.map((group) => [
              group.id,
              Object.freeze({
                label: group.label,
                accent: strength > 0 ? Object.freeze({ color: group.color, strength }) : null,
              }),
            ]),
          ),
  );

  // The event is derived from each committed state change, as the design group's is.
  ctx.state.onChange(({ previous, next }) => {
    if (previous.groups !== next.groups) events.groupsChanged.emit({ groups: list() });
  });

  const maySetGroup = (groupId: string): boolean =>
    ctx.doc.security.allowsField('set-group', { groupId });

  return {
    list,
    lookOf: (groupId) => (groupId === null ? null : (looks().get(groupId) ?? null)),
    maySet: (groupId) => ctx.allows(MODIFY) && maySetGroup(groupId),
    assertMaySet: (groupId, operation) => {
      ctx.assertAllowed(MODIFY, operation);
      if (maySetGroup(groupId)) return;
      const permission = `fields:set-group:group=${groupId}`;
      throw new PluginError('permission-denied', 'form', `${operation} requires ${permission}`, {
        permission,
      });
    },
  };
}
