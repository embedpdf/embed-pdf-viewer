/**
 * A date or a time field's own check, for a document whose scripts don't run. A format is two
 * scripts in the file: one that refuses text that is no date, one that writes the date the way
 * the pattern says. Without JavaScript neither runs, so the plugin does both itself, with the
 * code those scripts run (`parseDate`, `formatDate`): the field then holds the same value and
 * shows the same text as with JavaScript on. A format only its script knows (`other`) is left
 * to that script.
 */
import {
  formatDate,
  parseDate,
  type DatePartsInput,
  type ScriptDiagnostic,
} from '@embedpdf/core-acrojs';
import {
  takesFormat,
  type ChangeOp,
  type FormField,
  type FormFieldFormat,
  type FormFieldValue,
} from '@embedpdf/engine-core/runtime';

/** What the field's own check made of a value: the ops that show it formatted, or why it is refused. */
export type OwnFormatOutcome =
  | { readonly status: 'accepted'; readonly ops: readonly ChangeOp[] }
  | {
      readonly status: 'rejected';
      readonly message: string;
      readonly diagnostic: ScriptDiagnostic;
    };

/** A field's format when it is a date or a time, the two the plugin can check itself. */
function datedFormatOf(field: FormField): { readonly pattern: string } | null {
  if (!takesFormat(field.kind)) return null;
  const { format } = field as { format: FormFieldFormat | null };
  return format && format.kind !== 'other' ? format : null;
}

/**
 * Check `value` for `field` against the field's date or time format, as its keystroke script
 * does, and format it as its format script does. `null` for a field with no such format, and
 * for a value that is no text: nothing to check. An empty text is no date and no mistake.
 * `today` fills in what the text leaves out, as the scripts' own today does: the day
 * `ctx.clock.today()` says.
 */
export function ownFormatOf(
  field: FormField,
  value: FormFieldValue,
  today: DatePartsInput,
): OwnFormatOutcome | null {
  const format = datedFormatOf(field);
  if (!format || !('value' in value)) return null;
  const text = value.value ?? '';
  if (text === '') return { status: 'accepted', ops: [] };
  const date = parseDate(text, format.pattern, today);
  if (!date) {
    // The keystroke script's own words (`AFDate_KeystrokeEx`), so an app shows one message.
    const message = `Invalid date/time: please ensure that the date/time exists. Field [ ${field.name} ] should match format ${format.pattern}`;
    return { status: 'rejected', message, diagnostic: { code: 'invalid-field-value', message } };
  }
  return {
    status: 'accepted',
    ops: [
      {
        type: 'forms.setAppearanceText',
        field: field.ref,
        text: formatDate(date, format.pattern),
      },
    ],
  };
}
