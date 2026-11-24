/**
 * A field's purpose: what its value means (`email`, `date-signed`, a name an
 * app made up). The engine keeps it with the field and reads nothing into
 * it; what a purpose does is its reader's to decide.
 */
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/** The most characters a purpose has. */
export const FIELD_PURPOSE_MAX_LENGTH = 256;

/**
 * Whether `purpose` is one a field takes: 1 to 256 characters, with no white
 * space at its start or its end.
 */
export function isFieldPurpose(purpose: unknown): purpose is string {
  return (
    typeof purpose === 'string' &&
    purpose.length >= 1 &&
    purpose.length <= FIELD_PURPOSE_MAX_LENGTH &&
    purpose.trim() === purpose
  );
}

/**
 * The purpose a write names: `null` for none, which a draft also says by
 * leaving it out. One that isn't a purpose ({@link isFieldPurpose}) is
 * refused with `InvalidArg`, not trimmed.
 */
export function checkedPurpose(purpose: unknown): string | null {
  if (purpose === undefined || purpose === null) return null;
  if (!isFieldPurpose(purpose)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a field's purpose is 1 to 256 characters with no space at its start or end, or null for none",
      { details: { field: 'purpose' } },
    );
  }
  return purpose;
}
