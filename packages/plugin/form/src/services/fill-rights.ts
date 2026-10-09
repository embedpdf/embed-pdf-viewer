/**
 * Who may fill in, and sign, which field: the engine's own answer per field
 * (`ctx.allowsField`), so a control gated on it never disagrees with the
 * write. A field's group decides: a `fields:fill` (`fields:sign`) permission
 * for its group, or `doc.forms.fill` (`doc.sign`) for every field.
 */
import { memo, type Mirror } from '@embedpdf/core';

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
  /** Refuse a write to this field when the session may not fill it in, naming what it takes. */
  assertMayFill(field: Grouped, operation: string): void;
  /** What the session may fill in and sign, as a key that changes when that does: for memos. */
  key(): string;
}

export function createFillRights(ctx: FormContext, fields: Mirror<FieldIndex>): FillRights {
  const mayFill = (field: Grouped): boolean => ctx.allowsField('fill', field);
  const maySign = (field: Grouped): boolean => ctx.allowsField('sign', field);

  /** The form's groups, `null` (no group) among them. */
  const groups = memo(
    () => [fields.get()],
    (index) => [...new Set((index.snapshot?.fields ?? []).map((field) => field.groupId))],
  );

  return {
    mayFill,
    maySign,
    assertMayFill: (field, operation) => ctx.assertAllowedField('fill', field, operation),
    key: () =>
      groups()
        .map((groupId) => `${mayFill({ groupId }) ? 1 : 0}${maySign({ groupId }) ? 1 : 0}`)
        .join(''),
  };
}
