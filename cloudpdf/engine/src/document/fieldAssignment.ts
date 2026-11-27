import {
  groupIdOfAssignment,
  type EngineError,
  type FieldAssignment,
} from '@embedpdf/engine-core/runtime';
import { FIELD_ASSIGNMENT_SINCE } from '@embedpdf/engine-core/wire';

import { serverLacks } from '../transport/serverVersion';

/** A field write that can name `assignment`: a draft, a patch, or what an op expects. */
export type AssignmentWrite =
  | { readonly assignment?: unknown; readonly groupId?: string | null }
  | undefined;

/**
 * The refusal of a field write that makes a field one anyone fills in
 * (`{ kind: 'anyone' }`) when the server is older than such fields
 * ({@link FIELD_ASSIGNMENT_SINCE}), or `null` when it can go out. Any other
 * assignment goes out to such a server as the `groupId` it knows
 * ({@link assignmentForServer}). `serverVersion` is what the server last said
 * it is, `null` before it said so.
 */
export function anyoneTheServerLacks(
  serverVersion: string | null,
  ...writes: readonly AssignmentWrite[]
): EngineError | null {
  if (!writes.some((write) => isAnyone(write?.assignment))) return null;
  return serverLacks(serverVersion, 'a field anyone fills in', FIELD_ASSIGNMENT_SINCE, {
    field: 'assignment',
  });
}

/**
 * `write` as a server of `serverVersion` reads it. One older than
 * `assignment` ({@link FIELD_ASSIGNMENT_SINCE}) refuses a member it doesn't
 * know, so a group's or an unassigned field's assignment goes as the
 * `groupId` that came before it, which says the same. A write that names
 * both, or none, goes as it is.
 */
export function assignmentForServer<Write extends AssignmentWrite>(
  serverVersion: string | null,
  write: Write,
): Write {
  if (write?.assignment === undefined || write.groupId !== undefined) return write;
  if (serverLacks(serverVersion, '', FIELD_ASSIGNMENT_SINCE) === null) return write;
  const { assignment, ...rest } = write;
  return { ...rest, groupId: groupIdOfAssignment(assignment as FieldAssignment) } as Write;
}

/**
 * The refusal of an import whose bundle holds a field anyone fills in when
 * the server is older than such fields, or `null` when it can go out.
 * `bundle` is one already checked: its rows are read as they stand. Such a
 * server takes the bundle and makes the field an unassigned one without
 * saying so, which every signer but the sender would then be refused. A
 * bundle without one goes out: such a server reads each field's group.
 */
export function bundleAnyoneTheServerLacks(
  serverVersion: string | null,
  bundle: { readonly fields: readonly { readonly data: { readonly assignment?: unknown } }[] },
): EngineError | null {
  if (!bundle.fields.some(({ data }) => isAnyone(data.assignment))) return null;
  return serverLacks(serverVersion, 'a field anyone fills in', FIELD_ASSIGNMENT_SINCE, {
    field: 'assignment',
  });
}

function isAnyone(assignment: unknown): boolean {
  return (assignment as { kind?: unknown } | undefined)?.kind === 'anyone';
}
