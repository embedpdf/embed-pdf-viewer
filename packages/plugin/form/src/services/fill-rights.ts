/**
 * Who may fill in, and sign, which field: the engine's own answer per field
 * (`ctx.allowsField`), so a control gated on it never disagrees with the
 * write. A field's group decides: a `fields:fill` (`fields:sign`) permission
 * for its group, or `doc.forms.fill` (`doc.sign`) for every field.
 */
import { memo, type Mirror } from '@embedpdf/core';
import type { FormFieldDTO, FormFieldFamily } from '@embedpdf/engine-core/runtime';

import type { FillableFields } from '../contract';
import type { FieldIndex } from '../model';
import type { FormContext } from './context';

/** What decides who may fill a field in: its group. */
interface Grouped {
  readonly groupId: string | null;
}

export interface FillRights {
  /** Whether the session may fill in this field. */
  mayFill(field: Grouped): boolean;
  /** Whether the session may sign this signature field. */
  maySign(field: Grouped): boolean;
  /**
   * Whether people fill this field in by hand: the `fillable` setting lets them, and the session
   * may fill it in (a signature field: sign it). A field it says no to has its boxes `disabled`.
   */
  mayFillByHand(field: FormFieldDTO): boolean;
  /** Whether a field's boxes take input: by hand, and not read-only. What Tab stops at. */
  takesInput(field: FormFieldDTO): boolean;
  /** Refuse a write to this field when the session may not fill it in, naming what it takes. */
  assertMayFill(field: Grouped, operation: string): void;
  /** What the session may fill in and sign, as a key that changes when that does: for memos. */
  key(): string;
}

/** Whether the `fillable` setting lets people fill in a field of this family by hand. */
const isFillableByHand = (fillable: FillableFields, family: FormFieldFamily): boolean =>
  typeof fillable === 'boolean' ? fillable : fillable.includes(family);

export function createFillRights(ctx: FormContext, fields: Mirror<FieldIndex>): FillRights {
  const mayFill = (field: Grouped): boolean => ctx.allowsField('fill', field);
  const maySign = (field: Grouped): boolean => ctx.allowsField('sign', field);
  const mayFillByHand = (field: FormFieldDTO): boolean =>
    isFillableByHand(ctx.settings().get().fillable, field.family) &&
    (field.family === 'signature' ? maySign(field) : mayFill(field));

  /** The form's groups, `null` (no group) among them. */
  const groups = memo(
    () => [fields.view()],
    (index) => [...new Set((index.snapshot?.fields ?? []).map((field) => field.groupId))],
  );

  return {
    mayFill,
    maySign,
    mayFillByHand,
    takesInput: (field) => !field.readOnly && mayFillByHand(field),
    assertMayFill: (field, operation) => ctx.assertAllowedField('fill', field, operation),
    key: () =>
      groups()
        .map((groupId) => `${mayFill({ groupId }) ? 1 : 0}${maySign({ groupId }) ? 1 : 0}`)
        .join(''),
  };
}
