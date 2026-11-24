/**
 * The form's groups, as the app sets them: who this document's groups are (`setGroups()`), and
 * who new fields are placed for (the design group). Both are session state a toolbar sets and
 * reads; neither is written into the PDF. A field placed with a tool goes into the design group
 * (tools/handlers.ts); `null`, where it starts, names none, so the field is in no group.
 */
import type { FormCapability, FormGroupInput } from '../contract';
import { setDesignGroup, setGroups, type NamedGroup } from '../model';
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
      getDesignGroup: () => ctx.state.get().designGroup,
      setDesignGroup: (groupId) => {
        if (groupId !== null) groups.assertMaySet(groupId, 'form.setDesignGroup');
        ctx.state.update(setDesignGroup, groupId);
      },
      canSetGroup: groups.maySet,
    } satisfies Partial<FormCapability>,
  };
}
