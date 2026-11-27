/**
 * The form's groups, as the app sets them: who this document's groups are (`setGroups()`), and
 * who new fields are placed for (the design assignment: a group, anyone or nobody). Both are
 * session state a toolbar sets and reads; neither is written into the PDF. A field placed with a
 * tool gets the design assignment (tools/handlers.ts); nobody's, where it starts, is a field in
 * no group. `setDesignGroup()` is the released shorthand: a group's id, or `null` for nobody.
 */
import { assignmentOfGroup, groupIdOfAssignment } from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormGroupInput } from '../contract';
import { setDesignAssignment, setGroups, type NamedGroup } from '../model';
import type { FormContext, FormServices } from '../services';

/** The app's list as the state holds it: each id once (the first entry of an id is the group). */
function namedGroupsOf(groups: readonly FormGroupInput[]): readonly NamedGroup[] {
  const byId = new Map<string, NamedGroup>();
  for (const group of groups) {
    if (byId.has(group.id)) continue;
    byId.set(
      group.id,
      Object.freeze({ id: group.id, label: group.label ?? null, color: group.color ?? null }),
    );
  }
  return Object.freeze([...byId.values()]);
}

export function createGroupWrites(ctx: FormContext, { groups }: Pick<FormServices, 'groups'>) {
  return {
    api: {
      listGroups: groups.list,
      setGroups: (list) => {
        ctx.state.update(setGroups, namedGroupsOf(list));
      },
      getDesignGroup: () => groupIdOfAssignment(ctx.state.get().designAssignment),
      getDesignAssignment: () => ctx.state.get().designAssignment,
      setDesignGroup: (groupId) => {
        // Nobody's takes no right of its own: whoever may design the form names it.
        if (groupId !== null) groups.assertMaySet(groupId, 'form.setDesignGroup');
        ctx.state.update(setDesignAssignment, assignmentOfGroup(groupId));
      },
      setDesignAssignment: (assignment) => {
        if (assignment.kind !== 'unassigned') {
          groups.assertMayAssign(assignment, 'form.setDesignAssignment');
        }
        ctx.state.update(setDesignAssignment, assignment);
      },
      canSetGroup: groups.maySet,
      canAssign: groups.mayAssign,
    } satisfies Partial<FormCapability>,
  };
}
