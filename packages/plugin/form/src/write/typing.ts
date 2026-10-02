/**
 * The text someone is typing in a field, before it's written. A text field commits on blur or
 * Enter, when its scripts run (as in Acrobat), so what is typed waits here, one draft per field.
 * A download writes the drafts first (`ctx.onSettle`), the way Acrobat commits the field being
 * edited before it saves.
 */
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import type { FormSetValueResult } from '../contract';
import type { FormContext, FormServices } from '../services';

export function createTyping(
  ctx: Pick<FormContext, 'onSettle'>,
  { keyOf }: Pick<FormServices, 'keyOf'>,
  setText: (field: FormFieldRef, text: string) => Promise<FormSetValueResult>,
) {
  /** The text typed in each field and not written yet, by field key. */
  const drafts = new Map<string, { readonly field: FormFieldRef; readonly text: string }>();

  /** Write the field's draft, if it has one; `null` when there is nothing to write. */
  const commitDraftText = async (field: FormFieldRef): Promise<FormSetValueResult | null> => {
    const key = keyOf(field);
    const draft = drafts.get(key);
    if (!draft) return null;
    drafts.delete(key);
    return setText(draft.field, draft.text);
  };

  ctx.onSettle(async () => {
    await Promise.all([...drafts.values()].map((draft) => commitDraftText(draft.field)));
  });

  return {
    api: {
      draftText: (field: FormFieldRef, text: string): void => {
        drafts.set(keyOf(field), { field, text });
      },
      commitDraftText,
      discardDraftText: (field: FormFieldRef): void => {
        drafts.delete(keyOf(field));
      },
    },
  };
}
