/**
 * A fixture field's overrides with who it is for said whole: a test that names only a group
 * (`{ groupId: 'buyer' }`) gets that group's assignment, as the engine reads such a field, and
 * one that names an assignment keeps it.
 */
import { assignmentOfGroup, type FieldAssignment } from '@embedpdf/engine-core/runtime';

export const grouped = <Over extends { groupId?: string | null; assignment?: FieldAssignment }>(
  over: Over,
): Over & { assignment: FieldAssignment } => ({
  ...over,
  assignment: over.assignment ?? assignmentOfGroup(over.groupId ?? null),
});
