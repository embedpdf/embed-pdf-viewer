/**
 * A field's format: the shape its value has. In the file a format is the
 * field's format script (`/AA /F`) and its keystroke script (`/AA /K`), as
 * Acrobat writes them, so the scripts are the one record of it: a read works
 * the format out from them, and a write composes them from a checked pattern.
 * Nothing here needs zod or the runtime: a viewer predicts a format write
 * with the same functions the engine writes it with.
 */
import {
  isDatePattern,
  isTimePattern,
  STANDARD_DATE_PATTERNS,
  STANDARD_TIME_PATTERNS,
} from './datePattern';
import type { FormFieldKind } from './field';
import type {
  FieldActionsPatch,
  FieldScriptWrite,
  PdfActionTree,
  PdfFieldActions,
} from '../dto/PdfAction';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * The format of a text field or a dropdown, as a read gives it:
 *
 * - `date` and `time`: the format script is Acrobat's own call for one,
 *   with the pattern its value is shown in. A date's pattern has a date and
 *   may carry a time (`isDatePattern`); a time's is a time and nothing else
 *   (`isTimePattern`);
 * - `other`: any other format script. A kind a later version adds reads as
 *   `other` too.
 */
export type FormFieldFormat =
  | { kind: 'date'; pattern: string }
  | { kind: 'time'; pattern: string }
  | { kind: 'other' };

/** The formats a write makes: a date or a time. An `other` format is read, never written. */
export type FormFieldFormatWritable = Exclude<FormFieldFormat, { kind: 'other' }>;

/** Whether a field of `kind` has a format: a text field and a dropdown do. */
export function takesFormat(kind: FormFieldKind): kind is 'text' | 'combobox' {
  return kind === 'text' || kind === 'combobox';
}

/**
 * What a format is made of, per kind: the call a format script makes with a
 * pattern, the older call that names one of `standard` by number, the
 * keystroke script's two the same way, and which strings are a pattern of
 * the kind.
 *
 * Acrobat has no `AFTime_KeystrokeEx`: a time's keystroke script is always
 * `AFTime_Keystroke(n)`. Other tools write the call with a pattern, so it
 * is read, and never written.
 */
const CALLS = {
  date: {
    format: 'AFDate_FormatEx',
    numberedFormat: 'AFDate_Format',
    keystroke: 'AFDate_KeystrokeEx',
    numberedKeystroke: 'AFDate_Keystroke',
    standard: STANDARD_DATE_PATTERNS,
    isPattern: isDatePattern,
  },
  time: {
    format: 'AFTime_FormatEx',
    numberedFormat: 'AFTime_Format',
    keystroke: 'AFTime_KeystrokeEx',
    numberedKeystroke: 'AFTime_Keystroke',
    standard: STANDARD_TIME_PATTERNS,
    isPattern: isTimePattern,
  },
} as const;

type Kind = keyof typeof CALLS;

/** A name no call has: {@link patternOfCall} then reads the other wording only. */
const NO_CALL = '';

const KINDS: readonly Kind[] = ['date', 'time'];

/**
 * The pattern of `kind` that `script` names when it is exactly one call of
 * `byPattern` with a string that is one, or of `byNumber` with a number of
 * the kind's standard list; `null` for any other script. White space around
 * the call and one `;` after it are no part of it. A pattern holds no quote
 * and no backslash, so its string has no escape to read.
 */
function patternOfCall(
  script: string,
  kind: Kind,
  byPattern: string,
  byNumber: string,
): string | null {
  let source = script.trim();
  if (source.endsWith(';')) source = source.slice(0, -1).trimEnd();
  const call = /^([A-Za-z_]+)\(\s*(?:(["'])([^"'\\]*)\2|(\d{1,2}))\s*\)$/.exec(source);
  if (!call) return null;
  const [, name, , pattern, number] = call;
  const { isPattern, standard } = CALLS[kind];
  if (name === byPattern && pattern !== undefined) return isPattern(pattern) ? pattern : null;
  if (name === byNumber && number !== undefined) return standard[Number(number)] ?? null;
  return null;
}

/**
 * The format a format script gives its field, as Acrobat reads it: a date
 * for `AFDate_FormatEx("pattern")` or the older `AFDate_Format(n)`, a time
 * for `AFTime_FormatEx("pattern")` or `AFTime_Format(n)`, and `other` for
 * anything else. Only a script that is that one call is one: code that
 * merely contains the call is `other`, and so is a number the list doesn't
 * have, or a pattern that is none of its kind (`isDatePattern`,
 * `isTimePattern`): a date call with a time alone, a time call with a date
 * in it.
 */
export function formatOfScript(script: string): FormFieldFormat {
  for (const kind of KINDS) {
    const calls = CALLS[kind];
    const pattern = patternOfCall(script, kind, calls.format, calls.numberedFormat);
    if (pattern !== null) return { kind, pattern };
  }
  return { kind: 'other' };
}

/**
 * The format a field's scripts give it; `null` without a format script. The
 * format script alone decides, as in Acrobat: a keystroke script on its own
 * is no format. A format action that isn't one script (another action type,
 * scripts chained after it, a tree read incomplete) is `other`.
 */
export function formatOfActions(
  actions: PdfFieldActions<unknown> | undefined,
): FormFieldFormat | null {
  const tree = actions?.format;
  if (tree === undefined || tree === null) return null;
  if (typeof tree !== 'object') return { kind: 'other' };
  const script = loneScriptOf(tree);
  return script === null ? { kind: 'other' } : formatOfScript(script);
}

/**
 * A field as something older than `purpose` and `format` wrote it, made
 * whole: no purpose, since nothing older kept one, and the format the
 * field's own scripts give it, which is how a read of this version works it
 * out too. An older server answers with such a field, and a bundle kept from
 * an earlier version holds them. A field that has both comes back as it is.
 */
export function withPurposeAndFormat<Field extends Record<string, unknown>>(field: Field): Field {
  const noPurpose = field.purpose === undefined;
  const noFormat =
    field.format === undefined &&
    typeof field.kind === 'string' &&
    takesFormat(field.kind as FormFieldKind);
  if (!noPurpose && !noFormat) return field;
  return {
    ...field,
    ...(noPurpose ? { purpose: null } : {}),
    ...(noFormat ? { format: formatOfActions(field.actions as PdfFieldActions<unknown>) } : {}),
  };
}

/**
 * The script of a tree that is one JavaScript action and nothing after it;
 * `null` for any other tree. It reads a tree as it comes, a response not
 * yet checked included, so it takes nothing about its shape for granted.
 */
function loneScriptOf(tree: PdfActionTree<unknown>): string | null {
  const root = tree.root as { type?: unknown; script?: unknown; next?: unknown } | null;
  if (tree.incomplete !== false || !root || root.type !== 'javascript') return null;
  if (!Array.isArray(root.next) || root.next.length > 0) return null;
  return typeof root.script === 'string' ? root.script : null;
}

/**
 * The two scripts a format is written as, in Acrobat's wording: the format
 * script, one call with the pattern, and the keystroke script. A date's
 * keystroke script takes the pattern too. A time's names a standard time
 * pattern by number, the only keystroke call Acrobat has for a time
 * ({@link standardTimeLike}). The pattern is checked first
 * (`checkedFormat`), so the string holds nothing that could end it.
 */
export function formatScripts(format: FormFieldFormatWritable): {
  format: string;
  keystroke: string;
} {
  const calls = CALLS[format.kind];
  return {
    format: `${calls.format}("${format.pattern}");`,
    keystroke:
      format.kind === 'date'
        ? `${calls.keystroke}("${format.pattern}");`
        : `${calls.numberedKeystroke}(${standardTimeLike(format.pattern)});`,
  };
}

/**
 * The number of the standard time pattern with the shape of `pattern`: with
 * or without seconds, on a 12 or a 24 hour clock. A standard pattern gets
 * its own number, and any other the nearest one's, so a viewer that checks
 * a typed time against the numbered pattern takes what `pattern` shows.
 */
function standardTimeLike(pattern: string): number {
  return (pattern.includes('ss') ? 2 : 0) + (pattern.includes('tt') ? 1 : 0);
}

/**
 * A format as a write of the field's scripts: both events set for a date or
 * a time, both removed for `null`.
 */
export function scriptsOfFormat(format: FormFieldFormatWritable | null): FieldActionsPatch {
  if (format === null) return { keystroke: null, format: null };
  const scripts = formatScripts(format);
  const script = (source: string): FieldScriptWrite => ({ type: 'javascript', script: source });
  return { keystroke: script(scripts.keystroke), format: script(scripts.format) };
}

/**
 * Whether a field's keystroke script is the one its `format` goes with. A
 * date's is its keystroke call with the same pattern, by pattern or by
 * number. A time's is `AFTime_Keystroke(n)` with any number of the list,
 * which is how Acrobat pairs it with a pattern of the author's own, or the
 * call with the same pattern. A copy made without the right to write
 * scripts keeps such a format whole.
 */
export function isKeystrokeOfFormat(
  format: FormFieldFormatWritable,
  keystroke: PdfActionTree<unknown> | undefined,
): boolean {
  const script = keystroke ? loneScriptOf(keystroke) : null;
  if (script === null) return false;
  const calls = CALLS[format.kind];
  if (format.kind === 'time') {
    const numbered = patternOfCall(script, 'time', NO_CALL, calls.numberedKeystroke);
    if (numbered !== null) return true;
    return patternOfCall(script, 'time', calls.keystroke, NO_CALL) === format.pattern;
  }
  return patternOfCall(script, 'date', calls.keystroke, calls.numberedKeystroke) === format.pattern;
}

/** Whether a format is one a write makes: a date or a time, as a read gives it. */
export function isWritableFormat(
  format: FormFieldFormat | null,
): format is FormFieldFormatWritable {
  return format !== null && format.kind !== 'other';
}

/** Whether two formats are the same: both none, or the same kind and pattern. */
export function formatsEqual(left: FormFieldFormat | null, right: FormFieldFormat | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  return left.kind === 'other' || left.pattern === (right as FormFieldFormatWritable).pattern;
}

/** What a refused pattern is told, per kind: the rule its kind has. */
const PATTERN_RULE: Record<Kind, string> = {
  date:
    "a date format's pattern is 1 to 64 characters: the groups yyyy yy mmmm mmm mm m dd d, " +
    'at least one of them and the year, the month and the day each once at most, with ' +
    'spaces and / - . , between them, and at most one time (HH, H, hh or h, then :MM, then ' +
    ':ss and tt when it has them); two groups written in digits never touch',
  time:
    "a time format's pattern is a time and nothing else, at most 64 characters: HH, H, hh " +
    'or h, then :MM, then :ss when it has seconds, then tt when it has one',
};

/**
 * The format a write names, checked: a date or a time with a pattern of its
 * kind (`isDatePattern`, `isTimePattern`), or `null` for none. Anything else
 * is refused with `InvalidArg` before a byte is written: an `other` format,
 * another kind, a pattern that is none of the kind's.
 */
export function checkedFormat(format: unknown): FormFieldFormatWritable | null {
  if (format === null) return null;
  const given = (typeof format === 'object' ? format : {}) as { kind?: unknown; pattern?: unknown };
  if (given.kind === 'other') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a format of kind 'other' is read, never written: write its scripts in actions",
      { details: { field: 'format' } },
    );
  }
  if (given.kind !== 'date' && given.kind !== 'time') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a field's format is a date or a time with a pattern, or null for none",
      { details: { field: 'format' } },
    );
  }
  const { pattern } = given;
  if (!CALLS[given.kind].isPattern(pattern)) {
    throw new EngineError(EngineErrorCode.InvalidArg, PATTERN_RULE[given.kind], {
      details: { field: 'format.pattern' },
    });
  }
  return { kind: given.kind, pattern };
}

/**
 * The format a write gives a field of `kind`, checked, or `undefined` when
 * the write names none. A format on a kind that has none, and a format
 * beside a script for one of its own two events, are refused with
 * `InvalidArg`: one write has one author for each script.
 */
export function formatWriteOf(
  write: { readonly format?: unknown; readonly actions?: FieldActionsPatch },
  kind: FormFieldKind,
): FormFieldFormatWritable | null | undefined {
  if (write.format === undefined) return undefined;
  if (!takesFormat(kind)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `'format' does not apply to a ${kind} field`,
      { details: { field: 'format' } },
    );
  }
  const format = checkedFormat(write.format);
  for (const event of ['format', 'keystroke'] as const) {
    if (write.actions?.[event] !== undefined) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `'format' writes the field's ${event} script: name it or actions.${event}, not both`,
        { details: { field: `actions.${event}` } },
      );
    }
  }
  return format;
}

/**
 * The tree a read gives for a script a write made: one JavaScript action,
 * complete. What a format write leaves in the field's `actions`.
 */
export function scriptTreeOf(script: string): PdfActionTree<never> {
  return {
    root: { type: 'javascript', subtype: 'JavaScript', script, next: [] },
    incomplete: false,
    warnings: [],
  };
}
