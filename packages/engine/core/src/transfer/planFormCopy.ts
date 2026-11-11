/**
 * What a copy of form fields creates and leaves out, decided before its
 * first write: the copies as {@link planFormCopies} makes them, each checked
 * against the create schema as an import's fields are. Built with zod, so it
 * runs where the engine does, from `@embedpdf/engine-core/validation`.
 */
import { planFormCopies, type FormCopyPlan } from './formCopy';
import { checkedFieldDraft } from './planFormImport';

/**
 * What a copy of fields of `form` (in page space) creates, and what it
 * leaves out. Nothing here touches a document, so a copy refuses before its
 * first write: as {@link planFormCopies} refuses, and with `InvalidArg` when
 * a source's data isn't valid for its kind.
 */
export function planFormCopy(input: Parameters<typeof planFormCopies>[0]): FormCopyPlan {
  const plan = planFormCopies(input);
  for (const create of plan.creates) {
    checkedFieldDraft(create.draft, `copy: field ${create.source}`, { item: create.source });
  }
  return plan;
}
