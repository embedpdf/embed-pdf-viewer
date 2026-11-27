import type { EngineError } from '@embedpdf/engine-core/runtime';
import { ANYONE_FIELDS_SINCE } from '@embedpdf/engine-core/wire';

import { serverLacks } from '../transport/serverVersion';

/** A field write that can name `forAnyone`: a draft, a patch, or what an op expects. */
export type ForAnyoneWrite = { readonly forAnyone?: unknown } | undefined;

/**
 * The refusal of a field write that names `forAnyone` when the server is older
 * than fields anyone fills in ({@link ANYONE_FIELDS_SINCE}), or `null` when it
 * can go out. An older server's request schema refuses a member it doesn't
 * know, `false` too, so naming it at all is what counts. `serverVersion` is
 * what the server last said it is, `null` before it said so.
 */
export function forAnyoneTheServerLacks(
  serverVersion: string | null,
  ...writes: readonly ForAnyoneWrite[]
): EngineError | null {
  if (!writes.some((write) => write?.forAnyone !== undefined)) return null;
  return serverLacks(serverVersion, 'a field anyone fills in', ANYONE_FIELDS_SINCE, {
    field: 'forAnyone',
  });
}

/**
 * The refusal of an import whose bundle holds a field anyone fills in when
 * the server is older than such fields, or `null` when it can go out.
 * `bundle` is one already checked: its rows are read as they stand. Such a
 * server takes the bundle and makes the field an ordinary one without
 * saying so, which every signer but the sender would then be refused. A
 * bundle whose fields all read `forAnyone: false` goes out.
 */
export function bundleForAnyoneTheServerLacks(
  serverVersion: string | null,
  bundle: { readonly fields: readonly { readonly data: { readonly forAnyone?: unknown } }[] },
): EngineError | null {
  if (!bundle.fields.some(({ data }) => data.forAnyone === true)) return null;
  return serverLacks(serverVersion, 'a field anyone fills in', ANYONE_FIELDS_SINCE, {
    field: 'forAnyone',
  });
}
