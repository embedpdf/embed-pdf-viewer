import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/** A refusal is the same on both engines: `Forbidden`, naming the permission it needed. */
export function isPermissionRefusal(error: unknown): boolean {
  return (
    EngineError.is(error, EngineErrorCode.Forbidden) &&
    typeof error.details?.['required'] === 'string'
  );
}
