/**
 * The texts this session's format scripts wrote. The engine draws a field's
 * formatted text into its picture but doesn't say what it was (a
 * `forms.setAppearanceText` answers as `forms.updated`), so the painter takes
 * it from here: the text each change wrote, for the value the field had.
 * Looked up by the value the field has now, so a refused change, or another
 * session's fill, falls back to the value itself.
 */
import type { Mirror } from '@embedpdf/core';
import type { ChangeOp, FormFieldDTO } from '@embedpdf/engine-core/runtime';

import { fieldByRef, fieldKeyOf, type FieldIndex, type FieldKey } from '../model';
import type { FormContext } from './context';

/** The values remembered per field: enough for an undo or two. */
const KEPT_PER_FIELD = 8;

export interface FormattedTexts {
  /** The text the field shows for its value, as this session formatted it; `null` when it didn't. */
  textOf(field: FormFieldDTO): string | null;
  /** Moves when a text is remembered. */
  version(): number;
}

const valueOf = (field: FormFieldDTO): string | null =>
  field.family === 'text' || field.family === 'combobox' ? field.value : null;

export function createFormattedTexts(ctx: FormContext, fields: Mirror<FieldIndex>): FormattedTexts {
  const texts = new Map<FieldKey, Map<string, string>>();
  let version = 0;
  ctx.listen(ctx.changes.onStaged, (change) => {
    // Staged: the view shows the change, its fields at the values it wrote.
    const view = fields.view();
    for (const op of change.shows as readonly ChangeOp[]) {
      if (op.type !== 'forms.setAppearanceText') continue;
      const field = fieldByRef(view, op.field);
      const value = field ? valueOf(field) : null;
      if (!field || value === null) continue;
      const key = fieldKeyOf(field);
      const kept = texts.get(key) ?? new Map<string, string>();
      kept.delete(value);
      kept.set(value, op.text);
      while (kept.size > KEPT_PER_FIELD) kept.delete(kept.keys().next().value!);
      texts.set(key, kept);
      version += 1;
    }
  });
  return {
    textOf(field) {
      const value = valueOf(field);
      return value === null ? null : (texts.get(fieldKeyOf(field))?.get(value) ?? null);
    },
    version: () => version,
  };
}
