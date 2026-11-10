import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { changeKindSince, isChangeKind, lacksWhatArrivedIn } from '@embedpdf/engine-core/wire';

/**
 * The refusal of something the server doesn't have yet, or `null` when it
 * has it. `needs` is the version it arrived in, and `serverVersion` what the
 * server last said it is: `null` before it said so, which refuses nothing.
 *
 * The refusal names what was asked and both versions, so an app can say
 * which side to update; everything else keeps working
 * (docs/conventions/api-evolution.md, "Versions on the wire"). Every feature
 * that needs a newer server is checked through here.
 */
export function serverLacks(
  serverVersion: string | null,
  feature: string,
  needs: string,
  details: Record<string, unknown> = {},
): EngineError | null {
  if (serverVersion === null || !lacksWhatArrivedIn(serverVersion, needs)) return null;
  return new EngineError(
    EngineErrorCode.NotImplemented,
    `${feature} needs a server of version ${needs}, and this server is ${serverVersion}`,
    { details: { ...details, needs, serverVersion } },
  );
}

/** The refusal of a change with a kind of op the server doesn't have yet, or `null`. */
export function opsTheServerLacks(
  serverVersion: string | null,
  kinds: readonly string[],
): EngineError | null {
  for (const kind of kinds) {
    if (!isChangeKind(kind)) continue;
    const refusal = serverLacks(serverVersion, `a change with '${kind}'`, changeKindSince(kind), {
      kind,
    });
    if (refusal) return refusal;
  }
  return null;
}
