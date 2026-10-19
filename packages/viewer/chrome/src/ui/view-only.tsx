/**
 * The View only label: the `{ custom: 'view-only' }` item, in the main bar by default. It says why
 * the tools are gone, while nothing that changes the document is on (`readOnly`, or `disable`
 * naming every such feature), or while the scope lets this user change nothing in the open
 * document. Otherwise it draws nothing.
 */
import { useOptionalCapability, useOptionalSelector } from '@embedpdf/react/runtime';
import { AnnotationToken, type AnnotationCapability } from '@embedpdf/react/annotation';
import { useCommands, useCommandsSettings } from '@embedpdf/react/commands';
import { FormToken, type FormCapability } from '@embedpdf/react/form';
import { PageEditToken } from '@embedpdf/react/page-edit';
import { RedactionToken } from '@embedpdf/react/redaction';
import { SignatureToken, type SignatureCapability } from '@embedpdf/react/signature';
import { useT } from '@embedpdf/react/i18n';

import { leavesNothingToChange } from '../features';
import { Icon } from './icons';

/** Whether the scope lets this user change an annotation: make one, or change or delete one there. */
function mayChangeAnnotations(annotation: AnnotationCapability): boolean {
  if (annotation.canCreate()) return true;
  return annotation
    .list()
    .some(({ ref }) => annotation.canUpdate(ref) || annotation.canDelete(ref));
}

/** Whether the scope lets this user change the form: its fields, a value, or a signature. */
function mayChangeForm(form: FormCapability, signature: SignatureCapability | null): boolean {
  if (form.canDesign()) return true;
  return form
    .list()
    .some((field) =>
      field.family === 'signature'
        ? (signature?.canSign(field.ref) ?? false)
        : form.canFill(field.ref),
    );
}

/**
 * Whether the scope lets this user change nothing in the open document: no annotation to make,
 * change or delete (comments included), no field to fill in, sign or design, no page to edit and
 * no redaction to apply. Asked of the plugins' `can*` twins; `false` while no document is open.
 */
function useNothingAllowed(): boolean {
  const open = useOptionalCapability(AnnotationToken) !== null;
  const signature = useOptionalCapability(SignatureToken);
  const annotates = useOptionalSelector(AnnotationToken, mayChangeAnnotations, false);
  const fills = useOptionalSelector(FormToken, (form) => mayChangeForm(form, signature), false);
  const editsPages = useOptionalSelector(PageEditToken, (pageEdit) => pageEdit.canEdit(), false);
  const redacts = useOptionalSelector(RedactionToken, (redaction) => redaction.canApply(), false);
  return open && !annotates && !fills && !editsPages && !redacts;
}

/**
 * The label; `compact` draws its icon alone (a narrow bar, or a vertical one), its words still
 * there for a screen reader. Plain text, not a live region: it says what the viewer is, and the
 * refusal notice stays the viewer's one status message. Its tooltip says why.
 */
export function ViewOnlyLabel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const commands = useCommands();
  // Read again whenever what's turned off changes.
  useCommandsSettings((settings) => settings.disabledCategories);
  const turnedOff = leavesNothingToChange((feature) => commands.isCategoryDisabled(feature));
  const nothingAllowed = useNothingAllowed();
  if (!turnedOff && !nothingAllowed) return null;
  return (
    <span
      title={t(turnedOff ? 'viewOnly.turnedOff' : 'viewOnly.notAllowed')}
      className="bg-hover text-fg-secondary flex h-7 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium"
    >
      <Icon name="eye" size={16} className="shrink-0" />
      <span className={compact ? 'sr-only' : undefined}>{t('viewOnly.label')}</span>
    </span>
  );
}
