import type { EngineError } from '@embedpdf/engine-core/runtime';
import { FIELD_PURPOSE_AND_FORMAT_SINCE } from '@embedpdf/engine-core/wire';

import { serverLacks } from '../transport/serverVersion';

/** A field write that can name a purpose or a format: a draft, a patch, or what an op expects. */
export type FieldWrite = { readonly purpose?: unknown; readonly format?: unknown } | undefined;

/**
 * The refusal of a field write that names a `purpose` or a `format` when the
 * server is older than both ({@link FIELD_PURPOSE_AND_FORMAT_SINCE}), or
 * `null` when it can go out. An older server's request schema refuses a
 * member it doesn't know, `null` too, so naming one at all is what counts.
 * `serverVersion` is what the server last said it is, `null` before it said
 * so.
 */
export function fieldFactsTheServerLacks(
  serverVersion: string | null,
  ...writes: readonly FieldWrite[]
): EngineError | null {
  for (const write of writes) {
    for (const fact of ['purpose', 'format'] as const) {
      if (write?.[fact] === undefined) continue;
      const lacking = serverLacks(
        serverVersion,
        `a field's ${fact}`,
        FIELD_PURPOSE_AND_FORMAT_SINCE,
        { field: fact },
      );
      if (lacking) return lacking;
    }
  }
  return null;
}

/**
 * The refusal of an import whose bundle holds a field with a purpose when
 * the server is older than purposes, or `null` when it can go out. `bundle`
 * is one already checked: its rows are read as they stand. Such a
 * server takes the bundle, makes the field without its purpose and lists
 * nothing as left out, so the purpose would be lost unseen. A format needs
 * no such check: an older server reads it from the field's scripts, and
 * lists them among what it left out when it may not write them.
 */
export function bundlePurposeTheServerLacks(
  serverVersion: string | null,
  bundle: { readonly fields: readonly { readonly data: { readonly purpose?: unknown } }[] },
): EngineError | null {
  const named = bundle.fields.some(
    ({ data }) => data.purpose !== undefined && data.purpose !== null,
  );
  if (!named) return null;
  return serverLacks(serverVersion, "a field's purpose", FIELD_PURPOSE_AND_FORMAT_SINCE, {
    field: 'purpose',
  });
}
