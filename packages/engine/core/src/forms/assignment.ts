/**
 * Who fills a form field in, its assignment: one group's signers, every
 * signer, or no one in particular. The PDF keeps it in the field's
 * `/EMBD_Metadata`, as `/GroupID` and `/ForAnyone`.
 */
import type { FormFieldKind } from './field';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * Who fills a form field in:
 *   - `group`: the signers of one group (`groupId`), the buyer's fields;
 *   - `anyone`: every user who may fill in some field, each signer and the
 *     sender, as for a reference number whoever signs first knows. A signing
 *     that names no lock locks such a field once it holds a value. A
 *     signature field is never one: one signer signs it;
 *   - `unassigned`: no one in particular, which leaves the field to the
 *     users who may fill in every field, such as the sender.
 */
export type FieldAssignment =
  | { kind: 'group'; groupId: string }
  | { kind: 'anyone' }
  | { kind: 'unassigned' };

/** The longest group id, in characters. */
const GROUP_ID_MAX_LENGTH = 256;

/** The assignment a group id names, as `groupId` reads and writes it: that group, or `null` for none. */
export function assignmentOfGroup(groupId: string | null): FieldAssignment {
  return groupId === null ? { kind: 'unassigned' } : { kind: 'group', groupId };
}

/** The group id `assignment` reads as (`FormField.groupId`): its group's, else `null`. */
export function groupIdOfAssignment(assignment: FieldAssignment): string | null {
  return assignment.kind === 'group' ? assignment.groupId : null;
}

/** Whether `left` and `right` are the same assignment. */
export function assignmentsEqual(left: FieldAssignment, right: FieldAssignment): boolean {
  return groupIdOfAssignment(left) === groupIdOfAssignment(right) && left.kind === right.kind;
}

/**
 * The assignment a new field gets: what the draft names (`assignment`, or
 * the `groupId` that came before it), else `unassigned`. Refused with
 * `InvalidArg` as {@link assignmentAfter} says.
 */
export function draftAssignment(draft: {
  readonly kind: FormFieldKind;
  readonly groupId?: string | null;
  readonly assignment?: FieldAssignment;
}): FieldAssignment {
  return checkedForKind(namedAssignment(draft) ?? { kind: 'unassigned' }, draft.kind);
}

/**
 * The assignment an update leaves: what the patch names, else the field's
 * own. Either member works from any assignment: `assignment` says it
 * whole, and `groupId` is the shorthand that came before it, a group id for
 * that group and `null` for `unassigned`. Refused with `InvalidArg`
 * (`details.field` naming the member): both members in one write, an
 * assignment that isn't one of the three (a group's id is 1 to 256
 * characters), and `anyone` on a signature field.
 */
export function assignmentAfter(
  patch: { readonly groupId?: string | null; readonly assignment?: FieldAssignment },
  field: { readonly kind: FormFieldKind; readonly assignment: FieldAssignment },
): FieldAssignment {
  const named = namedAssignment(patch);
  return named === undefined ? field.assignment : checkedForKind(named, field.kind);
}

/**
 * A field as something older than `assignment` wrote it, made whole: its
 * group, else `unassigned`. An older server answers with such a field, and a
 * bundle kept from an earlier version holds them. A field that has one comes
 * back as it is.
 */
export function withAssignment<Field extends Record<string, unknown>>(field: Field): Field {
  if (field.assignment !== undefined) return field;
  const groupId = typeof field.groupId === 'string' ? field.groupId : null;
  return { ...field, assignment: assignmentOfGroup(groupId) };
}

/** The assignment a write names, checked, or `undefined` when it names none. */
function namedAssignment(write: {
  readonly groupId?: string | null;
  readonly assignment?: unknown;
}): FieldAssignment | undefined {
  if (write.assignment !== undefined && write.groupId !== undefined) {
    throw invalid(
      'assignment',
      'name a field\'s assignment or its groupId, not both: { kind: "group", groupId } says both',
    );
  }
  if (write.assignment !== undefined) return checkedShape(write.assignment);
  if (write.groupId === undefined) return undefined;
  if (write.groupId !== null) checkedGroupId(write.groupId, 'groupId');
  return assignmentOfGroup(write.groupId);
}

function checkedShape(assignment: unknown): FieldAssignment {
  const kind =
    assignment !== null && typeof assignment === 'object'
      ? (assignment as { kind?: unknown }).kind
      : undefined;
  if (kind === 'anyone' || kind === 'unassigned') return { kind };
  if (kind === 'group') {
    const groupId = (assignment as { groupId?: unknown }).groupId;
    checkedGroupId(groupId, 'assignment');
    return { kind, groupId: groupId as string };
  }
  throw invalid(
    'assignment',
    "a field's assignment is { kind: 'group', groupId }, { kind: 'anyone' } or { kind: 'unassigned' }",
  );
}

function checkedGroupId(groupId: unknown, member: string): void {
  if (typeof groupId !== 'string' || groupId.length < 1 || groupId.length > GROUP_ID_MAX_LENGTH) {
    const orNull = member === 'groupId' ? ', or null for no group' : '';
    throw invalid(member, `a field's groupId is 1 to ${GROUP_ID_MAX_LENGTH} characters${orNull}`);
  }
}

function checkedForKind(assignment: FieldAssignment, kind: FormFieldKind): FieldAssignment {
  if (assignment.kind === 'anyone' && kind === 'signature') {
    throw invalid(
      'assignment',
      'a signature field is signed by one signer, so it is never for anyone',
    );
  }
  return assignment;
}

function invalid(member: string, message: string): EngineError {
  return new EngineError(EngineErrorCode.InvalidArg, message, { details: { field: member } });
}
