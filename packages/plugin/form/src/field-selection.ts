import type {
  FormFieldDTO,
  FormFieldRef,
  FormSubmissionEntry,
  PdfActionTargetRef,
} from '@embedpdf/engine-core/runtime';
import type { ActionDiagnostic, SubmitIntent } from '@embedpdf/plugin-actions/contract';

/**
 * ISO field selection, written ONCE for ResetForm (Tables 241/242) and
 * SubmitForm (Tables 239/240): a NAME target selects the field AND its
 * descendants (FQN dot-prefix — `parent` selects `parent.c1`, the rule the
 * old exact-match resolution violated); an objectNumber target selects that
 * field dictionary. Include mode keeps the selection; exclude mode keeps
 * the complement (a name excludes its subtree the same way it includes
 * it). `targets === null` (the key ABSENT) selects everything and the flag
 * is ignored; `[]` + include selects NOTHING while `[]` + exclude selects
 * everything — presence and emptiness are different states.
 *
 * `listed` reports whether a field was ADDRESSED by the target list
 * (directly or through its subtree) — the "explicitly listed" predicate the
 * submit honesty diagnostics key on.
 */
export const resolveFieldSelection = <F extends { name: string; ref: FormFieldRef }>(
  all: readonly F[],
  targets: PdfActionTargetRef[] | null,
  exclude: boolean,
): { selected: F[]; listed: (field: F) => boolean } => {
  if (targets === null) return { selected: [...all], listed: () => false };
  const names = targets.filter((t) => t.kind === 'name').map((t) => t.name);
  const objectNumbers = new Set(
    targets.filter((t) => t.kind === 'objectNumber').map((t) => t.objectNumber),
  );
  const listed = (field: F): boolean =>
    (field.ref.kind === 'objectNumber' && objectNumbers.has(field.ref.fieldObjectNumber)) ||
    names.some((name) => field.name === name || field.name.startsWith(`${name}.`));
  const selected = exclude ? all.filter((f) => !listed(f)) : all.filter(listed);
  return { selected, listed };
};

/**
 * Build the resolved submission dataset from a live field list (Tables
 * 239/240 semantics; pure — the capability supplies a FRESH engine read so
 * no model-lag class exists):
 *
 * - the unconditional **NoExport veto** — even an explicit include cannot
 *   override it (diagnosed when explicitly listed, so the veto is
 *   observable, silent when swept in implicitly);
 * - **push-buttons and signatures** never contribute entries in v1 —
 *   ISO's explicit-pushbutton-`/AP`-in-FDF rule is unrepresentable in the
 *   current DTO, so an EXPLICITLY listed one is diagnosed
 *   (`submit-entry-unsupported`), never silently dropped;
 * - an **unsupported `/V` shape** is always diagnosed (silent omission
 *   would be data loss);
 * - a valueless field becomes a NAME-ONLY entry (`value: null`) only under
 *   IncludeNoValueFields, else it is skipped (the ISO default);
 * - values are entry-faithful: scalar → string, array (multi-select list
 *   box) → string[]; the submitted name is the fully qualified name.
 */
export const buildSubmitEntries = (
  fields: readonly FormFieldDTO[],
  intent: SubmitIntent,
  diagnose: (diagnostic: ActionDiagnostic) => void,
): FormSubmissionEntry[] => {
  const { selected, listed } = resolveFieldSelection(fields, intent.fields, intent.exclude);
  const explicitInclude = intent.fields !== null && !intent.exclude;
  const entries: FormSubmissionEntry[] = [];
  for (const field of selected) {
    const explicit = explicitInclude && listed(field);
    if (field.family === 'pushbutton' || field.family === 'signature') {
      if (explicit) {
        diagnose({
          code: 'submit-entry-unsupported',
          message: `submit: '${field.name}' (${field.family}) has no representable submission value in v1 — skipped`,
        });
      }
      continue;
    }
    if (field.flags.noExport) {
      if (explicit) {
        diagnose({
          code: 'submit-entry-unsupported',
          message: `submit: '${field.name}' carries the NoExport flag — the veto is unconditional (ISO 12.7.6.2), skipped`,
        });
      }
      continue;
    }
    const entry = field.valueEntry;
    if (entry.kind === 'scalar') {
      entries.push({ name: field.name, value: entry.value });
    } else if (entry.kind === 'array') {
      entries.push({ name: field.name, value: entry.values });
    } else if (entry.kind === 'none') {
      if (intent.includeNoValueFields) entries.push({ name: field.name, value: null });
    } else {
      diagnose({
        code: 'submit-entry-unsupported',
        message: `submit: '${field.name}' has an unsupported /V shape — skipped (would otherwise be silent data loss)`,
      });
    }
  }
  return entries;
};
