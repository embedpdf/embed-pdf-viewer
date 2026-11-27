/**
 * A field anyone fills in: every signer may fill it in, not one group's. It
 * is the third answer to "whose field is this?", beside a group (one
 * signer's) and no group (the sender's).
 */
import type { FormFieldKind } from './field';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * Whether the field a write leaves is one anyone fills in: what the write
 * names, else what the field was (`was`, `false` for a new field). `field`
 * is the field as the write leaves it: its kind and its group. Refused with
 * `InvalidArg`: a value that isn't `true` or `false`, and `true` on a field
 * in a group or on a signature field, which one signer signs.
 */
export function checkedForAnyone(
  named: unknown,
  field: { readonly kind: FormFieldKind; readonly groupId: string | null },
  was = false,
): boolean {
  if (named !== undefined && typeof named !== 'boolean') {
    throw new EngineError(EngineErrorCode.InvalidArg, "a field's forAnyone is true or false", {
      details: { field: 'forAnyone' },
    });
  }
  if (!(named ?? was)) return false;
  if (field.kind === 'signature') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'a signature field is signed by one signer, so it is never for anyone',
      { details: { field: 'forAnyone' } },
    );
  }
  if (field.groupId !== null) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'a field in a group is not also for anyone: send groupId: null with forAnyone: true, or ' +
        'forAnyone: false with a groupId',
      { details: { field: 'forAnyone' } },
    );
  }
  return true;
}

/**
 * A field as something older tha `forAnyone` wrote it, made whole: no field
 * was for anyone then. An older server answers with such a field, and a
 * bundle kept from an earlier version holds them. A field that has it comes
 * back as it is.
 */
export function withForAnyone<Field extends Record<string, unknown>>(field: Field): Field {
  return field.forAnyone === undefined ? { ...field, forAnyone: false } : field;
}
