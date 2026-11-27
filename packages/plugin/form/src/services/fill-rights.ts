/**
 * Who may fill in, and sign, which field: the engine's own answer per field
 * (`ctx.allowsField`), so a control gated on it never disagrees with the
 * write. A field's group decides: a `fields:fill` (`fields:sign`) permission
 * for its group, or `doc.forms.fill` (`doc.sign`) for every field. A field
 * anyone fills in (its `assignment` is `{ kind: 'anyone' }`) takes any of them.
 */
import { memo, type AssignedField, type Mirror } from '@embedpdf/core';
import type { FormField, FormFieldKind } from '@embedpdf/engine-core/runtime';

import type { FillableFields } from '../contract';
import type { FieldIndex } from '../model';
import type { FormContext } from './context';

export interface FillRights {
  /** Whether the session may fill in this field. */
  mayFill(field: AssignedField): boolean;
  /** Whether the session may sign this signature field. */
  maySign(field: AssignedField): boolean;
  /** Whether the session may fill this field in, or sign it for a signature field: its permissions alone. */
  mayFillOrSign(field: FormField): boolean;
  /**
   * Whether people fill this field in by hand: the `fillable` setting lets them, and the session
   * may fill it in (a signature field: sign it). A field it says no to has its boxes `disabled`.
   */
  mayFillByHand(field: FormField): boolean;
  /** Whether a field's boxes take input: by hand, and not read-only. What Tab stops at. */
  takesInput(field: FormField): boolean;
  /** Refuse a write to this field when the session may not fill it in, naming what it takes. */
  assertMayFill(field: AssignedField, operation: string): void;
  /** What the session may fill in and sign, as a key that changes when that does: for memos. */
  key(): string;
}

/** Whether the `fillable` setting lets people fill in a field of this kind by hand. */
const isFillableByHand = (fillable: FillableFields, kind: FormFieldKind): boolean =>
  typeof fillable === 'boolean' ? fillable : fillable.includes(kind);

export function createFillRights(ctx: FormContext, fields: Mirror<FieldIndex>): FillRights {
  const mayFill = (field: AssignedField): boolean => ctx.allowsField('fill', field);
  const maySign = (field: AssignedField): boolean => ctx.allowsField('sign', field);
  const mayFillOrSign = (field: FormField): boolean =>
    field.kind === 'signature' ? maySign(field) : mayFill(field);
  const mayFillByHand = (field: FormField): boolean =>
    isFillableByHand(ctx.settings().get().fillable, field.kind) && mayFillOrSign(field);

  /** Who the form's fields are for, each once: their groups, anyone and nobody. */
  const assignments = memo(
    () => [fields.view()],
    (index): readonly AssignedField[] => {
      const seen = new Map<string, AssignedField>();
      for (const { groupId, assignment } of index.snapshot?.fields ?? []) {
        seen.set(JSON.stringify(assignment), { groupId, assignment });
      }
      return [...seen.values()];
    },
  );

  return {
    mayFill,
    maySign,
    mayFillOrSign,
    mayFillByHand,
    takesInput: (field) => !field.readOnly && mayFillByHand(field),
    assertMayFill: (field, operation) => ctx.assertAllowedField('fill', field, operation),
    key: () =>
      assignments()
        .map((field) => `${mayFill(field) ? 1 : 0}${maySign(field) ? 1 : 0}`)
        .join(''),
  };
}
