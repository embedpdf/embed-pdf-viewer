/**
 * What a form op leaves, worked out before the engine runs it: the field and
 * the rows of its widgets, as a read of them would return them afterwards.
 * The engine's rules, as plain functions, so a viewer can show a write at
 * once and the engine follows the same rules (`runFormPredictionConformance`
 * checks every op on both engines).
 *
 * What these can't know is left as it was, and a read after the write tells:
 * dates and who filled a field in, the fonts a document's own default
 * appearance names, and a `/V` an ancestor field holds (a cleared value then
 * reads as an empty string, not as none).
 */
import type { FormFieldOptionInput, FormFieldDraft, WidgetPlacement } from './draft';
import type { FormFieldDisplay } from './effects';
import type { FormFieldDTO, FormFieldOption, FormFieldWidget, ToggleFieldWidget } from './field';
import type { FormFieldPatch } from './patch';
import type { FormFieldValue } from './value';
import type { FormValueEntry } from './value-entry';
import { standingRectOf } from './widgets';
import { assertChoiceDefault, fieldValueWriteOf } from './write';
import type { Annotation } from '../annotation/kinds';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { formWidget } from '../identity/FormFieldRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';
import { annotationOfDraft } from '../pageSpace/helpers';

/** A field and the rows of its widgets: what a form op changes, as its answer reports them. */
export interface FieldWithWidgets<C extends Coordinates = PageCoordinates> {
  readonly field: FormFieldDTO<C>;
  /** The rows of the field's widgets, as the form's `widgets` holds them. */
  readonly widgets: readonly WidgetAnnotation<C>[];
}

/* ── values ─────────────────────────────────────────────────────────────── */

/**
 * `forms.setValue`: a text field holds the text, cut to its maximum length
 * (in characters); a checkbox checks every widget with the target's export
 * value and on-state; a radio group checks the first button with the value,
 * or every one with it when its radios move in unison; a choice field holds
 * its option values in option order, or a dropdown's free text. Refuses what
 * the engine refuses (`fieldValueWriteOf`).
 */
export function fieldAfterValue<C extends Coordinates>(
  current: FieldWithWidgets<C>,
  value: FormFieldValue,
): FieldWithWidgets<C> {
  const { field } = current;
  const write = fieldValueWriteOf(field, value);
  switch (write.kind) {
    case 'text': {
      if (field.family !== 'text') return current;
      const text = firstCharacters(write.value, field.maxLength);
      if (text === field.value) return current;
      return redrawn(
        { ...field, value: text, valueEntry: { kind: 'scalar', value: text } },
        current,
      );
    }
    case 'toggle': {
      if (field.family !== 'checkbox' && field.family !== 'radio') return current;
      const target = field.widgets.findIndex((widget) => widget.onState === write.state);
      return toggled(current, write.state === null ? -1 : target);
    }
    case 'choice': {
      if (field.family !== 'combobox' && field.family !== 'listbox') return current;
      return redrawn(choiceFieldWith(field, write.values), current);
    }
  }
}

/**
 * `forms.reset`: back to the default value. A text field holds its default
 * (or nothing); a choice field its default options; a checkbox or radio
 * group checks the widget its default names, or none.
 */
export function fieldAfterReset<C extends Coordinates>(
  current: FieldWithWidgets<C>,
): FieldWithWidgets<C> {
  const { field } = current;
  const defaults = field.defaultValueEntry;
  switch (field.family) {
    case 'text': {
      if (defaults.kind === 'array' || defaults.kind === 'unsupported') {
        throw notReset(field);
      }
      const value = defaults.kind === 'scalar' ? defaults.value : '';
      const entry: FormValueEntry = defaults.kind === 'scalar' ? defaults : { kind: 'none' };
      return redrawn({ ...field, value, valueEntry: entry }, current);
    }
    case 'checkbox':
    case 'radio': {
      if (defaults.kind === 'array' || defaults.kind === 'unsupported') throw notReset(field);
      const state = defaults.kind === 'scalar' ? defaults.value : null;
      if (state === null || state === 'Off') return toggled(current, -1);
      const target = widgetNamedBy(field.widgets, state);
      if (target < 0) throw notReset(field);
      return toggled(current, target);
    }
    case 'combobox':
    case 'listbox': {
      if (defaults.kind === 'unsupported') throw notReset(field);
      let values =
        defaults.kind === 'scalar'
          ? [defaults.value]
          : defaults.kind === 'array'
            ? [...defaults.values]
            : [];
      // An empty default selects nothing, unless an option's value is empty.
      if (values.length === 1 && values[0] === '' && !choiceMatches(field, values)) values = [];
      if (!choiceMatches(field, values) && !freeTextAllowed(field, values)) throw notReset(field);
      return redrawn(choiceFieldWith(field, values), current);
    }
    default:
      throw notReset(field);
  }
}

/**
 * `forms.setDisplay`, on each widget's flags, as Acrobat's `Field.display`
 * sets them: visible and printed; hidden; visible but not printed; printed
 * but not shown on screen.
 */
export function widgetsAfterDisplay<C extends Coordinates>(
  widgets: readonly WidgetAnnotation<C>[],
  display: FormFieldDisplay,
): WidgetAnnotation<C>[] {
  const flags = DISPLAY_FLAGS[display];
  return widgets.map((row) =>
    Object.keys(flags).every((key) => row[key as keyof typeof flags] === flags[key as never])
      ? row
      : { ...row, ...flags },
  );
}

const DISPLAY_FLAGS = {
  visible: { invisible: false, hidden: false, noView: false, print: true },
  hidden: { invisible: false, hidden: true, noView: false, print: true },
  noPrint: { invisible: false, hidden: false, noView: false, print: false },
  noView: { hidden: false, noView: true, print: true },
} as const satisfies Record<FormFieldDisplay, Partial<Record<string, boolean>>>;

/* ── creating and changing fields ───────────────────────────────────────── */

/**
 * The default (`/DV`) a draft gives its field: a text field's or dropdown's
 * one value, a list box's option values in option order; none without one.
 */
export function defaultEntryOfDraft<C extends Coordinates>(
  draft: FormFieldDraft<C>,
): FormValueEntry {
  if (
    (draft.family === 'combobox' || draft.family === 'listbox') &&
    draft.defaultValue !== undefined
  ) {
    const values = Array.isArray(draft.defaultValue) ? draft.defaultValue : [draft.defaultValue];
    assertChoiceDefault({ ...draft, options: draft.options ?? [] }, values);
  }
  switch (draft.family) {
    case 'text':
    case 'combobox':
      return draft.defaultValue !== undefined ? scalar(draft.defaultValue) : none();
    case 'listbox':
      return choiceEntryOf(
        inOptionOrder((draft.options ?? []).map(optionOf), draft.defaultValue ?? []),
      );
    default:
      return none();
  }
}

/** What a draft alone doesn't say about the field `forms.create` makes. */
export interface FieldDraftContext {
  /** The field's object number. */
  readonly objectNumber: number;
  /** Its widgets' refs, in `draft.widgets` order. */
  readonly widgets: readonly AnnotationRef[];
  /** The group a draft without one goes in: the session's own (`identity.groupId`). */
  readonly groupId?: string | null;
  /** Who creates it, and when, as the engine stamps it. Left out, a read says `null`. */
  readonly createdBy?: string | null;
  readonly createdAt?: string | null;
  /** The name each widget gets (a fresh UUIDv7 the engine mints), in `widgets` order. */
  readonly widgetNames?: readonly string[];
}

/**
 * `forms.create`: the field and its widgets as a read of them returns them.
 * Every flag the draft doesn't set is off, the value is empty (a default
 * only sets the default), a checkbox's export value is `'Yes'` unless its
 * widget names one, and a toggle's widgets start off.
 */
export function formFieldOfDraft(
  draft: FormFieldDraft,
  context: FieldDraftContext,
): FieldWithWidgets {
  const placements = draft.widgets ?? [];
  const rows = placements.map((placement, at) =>
    widgetRowOfPlacement(draft, placement, {
      ref: context.widgets[at]!,
      field: context.objectNumber,
      nm: context.widgetNames?.[at],
    }),
  );
  const widgets: FormFieldWidget[] = rows.map((row) =>
    formWidget(objectNumberOf(row.ref), row.page),
  );
  const options = (
    draft.family === 'combobox' || draft.family === 'listbox' ? (draft.options ?? []) : []
  ).map(optionOf);
  const base = {
    ref: { kind: 'objectNumber' as const, objectNumber: context.objectNumber },
    name: draft.name,
    origin: 'acroform' as const,
    readOnly: draft.readOnly ?? false,
    required: draft.required ?? false,
    noExport: draft.noExport ?? false,
    alternateName: draft.alternateName ?? null,
    mappingName: draft.mappingName ?? null,
    valueEntry: { kind: 'none' } as FormValueEntry,
    defaultValueEntry: { kind: 'none' } as FormValueEntry,
    groupId: draft.groupId ?? context.groupId ?? null,
    createdBy: context.createdBy ?? null,
    createdAt: context.createdAt ?? null,
    filledBy: null,
    filledByName: null,
    filledAt: null,
    importedBy: null,
  };
  let field: FormFieldDTO;
  switch (draft.family) {
    case 'text': {
      const defaultValue = draft.defaultValue ?? '';
      field = {
        ...base,
        family: 'text',
        defaultValueEntry: defaultEntryOfDraft(draft),
        value: '',
        defaultValue,
        maxLength: draft.maxLength ?? null,
        multiline: draft.multiline ?? false,
        password: draft.password ?? false,
        comb: draft.comb ?? false,
        widgets,
      };
      break;
    }
    case 'checkbox': {
      const toggles = placements.map((placement, at) =>
        toggleWidgetOf(widgets[at]!, placement.exportValue ?? 'Yes'),
      );
      field = {
        ...base,
        family: 'checkbox',
        checked: false,
        exportValue: toggles[0]?.exportValue ?? 'Yes',
        widgets: toggles,
      };
      break;
    }
    case 'radio': {
      const toggles = placements.map((placement, at) =>
        toggleWidgetOf(widgets[at]!, placement.exportValue ?? ''),
      );
      field = {
        ...base,
        family: 'radio',
        value: 'Off',
        radiosInUnison: draft.radiosInUnison ?? false,
        noToggleToOff: draft.noToggleToOff ?? false,
        widgets: toggles,
      };
      break;
    }
    case 'combobox':
      field = {
        ...base,
        family: 'combobox',
        defaultValueEntry: defaultEntryOfDraft(draft),
        value: '',
        defaultValue: draft.defaultValue ?? '',
        edit: draft.edit ?? false,
        options,
        widgets,
      };
      break;
    case 'listbox': {
      const defaults = draft.defaultValue ?? [];
      field = {
        ...base,
        family: 'listbox',
        defaultValueEntry: defaultEntryOfDraft(draft),
        selectedValues: [],
        defaultValue: inOptionOrder(options, defaults),
        multiSelect: draft.multiSelect ?? false,
        options,
        topIndex: 0,
        widgets,
      };
      break;
    }
    default:
      field = { ...base, family: draft.family, widgets };
  }
  return { field, widgets: rows };
}

/**
 * `forms.update`: the settings the patch names. A new name replaces the
 * field's own segment of its dotted name; new options keep what is still
 * selected (an editable dropdown keeps its free text) and its default the
 * same way; `null` clears a limit, a name or a default.
 */
export function formFieldAfter<C extends Coordinates>(
  current: FieldWithWidgets<C>,
  patch: FormFieldPatch,
): FieldWithWidgets<C> {
  const given = patch as Record<string, unknown>;
  let field = { ...current.field } as FormFieldDTO<C> & Record<string, unknown>;
  if (patch.name !== undefined) {
    const parent = field.name.lastIndexOf('.');
    field.name = parent < 0 ? patch.name : `${field.name.slice(0, parent + 1)}${patch.name}`;
  }
  for (const flag of FLAGS) {
    if (typeof given[flag] === 'boolean' && flag in field) field[flag] = given[flag];
  }
  if (patch.alternateName !== undefined) field.alternateName = patch.alternateName || null;
  if (patch.mappingName !== undefined) field.mappingName = patch.mappingName || null;
  if (patch.groupId !== undefined) field.groupId = patch.groupId;
  if (field.family === 'text') {
    if ('maxLength' in patch && patch.maxLength !== undefined) field.maxLength = patch.maxLength;
    if ('defaultValue' in patch && patch.defaultValue !== undefined) {
      const value = patch.defaultValue as string | null;
      field.defaultValue = value ?? '';
      field.defaultValueEntry = value === null ? none() : scalar(value);
    }
  }
  let redraw = false;
  if (field.family === 'combobox' || field.family === 'listbox') {
    if ('options' in patch && patch.options) {
      field = withOptions(field, patch.options.map(optionOf)) as typeof field;
      redraw = true;
    }
    if ('defaultValue' in patch && patch.defaultValue !== undefined) {
      const values =
        patch.defaultValue === null
          ? []
          : Array.isArray(patch.defaultValue)
            ? patch.defaultValue
            : [patch.defaultValue];
      assertChoiceDefault(field, values);
      field = withDefault(field, values) as typeof field;
    }
  }
  const after = { ...current, field: field as FormFieldDTO<C> };
  return redraw ? redrawn(after.field, after) : after;
}

const FLAGS = [
  'readOnly',
  'required',
  'noExport',
  'multiline',
  'password',
  'comb',
  'radiosInUnison',
  'noToggleToOff',
  'edit',
  'multiSelect',
] as const;

/* ── the rules underneath ───────────────────────────────────────────────── */

/** The first `limit` characters of `text` (characters, as the file counts them); all without a limit. */
function firstCharacters(text: string, limit: number | null): string {
  if (!limit) return text;
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit).join('') : text;
}

/** The field, with every widget's appearance drawn again (a text or choice write). */
function redrawn<C extends Coordinates>(
  field: FormFieldDTO<C>,
  current: FieldWithWidgets<C>,
): FieldWithWidgets<C> {
  return {
    field,
    widgets: current.widgets.map((row) =>
      row.hasAppearance ? row : { ...row, hasAppearance: true },
    ),
  };
}

/**
 * The widget a checkbox's or radio group's default names: the one whose
 * on-state it is, or, when none is, the one at that position (a field with
 * `/Opt` written by a tool that names its widgets by position). `-1`: none.
 */
function widgetNamedBy(widgets: readonly ToggleFieldWidget[], state: string): number {
  const named = widgets.findIndex((widget) => widget.onState === state);
  if (named >= 0 || !/^\d+$/.test(state)) return named;
  return Number(state) < widgets.length ? Number(state) : -1;
}

/**
 * A checkbox or radio group with widget `target` checked (`-1`: none), and
 * the widgets that go with it: every widget with its export value and
 * on-state for a checkbox or radios in unison, otherwise that one. Its value
 * names the checked widget's on-state (`/V` names the appearance state that
 * is on), or `Off`.
 */
function toggled<C extends Coordinates>(
  current: FieldWithWidgets<C>,
  target: number,
): FieldWithWidgets<C> {
  const field = current.field;
  if (field.family !== 'checkbox' && field.family !== 'radio') return current;
  const unison = field.family === 'checkbox' || field.radiosInUnison;
  const on = target >= 0 ? field.widgets[target]! : null;
  const toggles = field.widgets.map((widget, at): ToggleFieldWidget => {
    const checked =
      on !== null &&
      (unison
        ? widget.exportValue === on.exportValue && widget.onState === on.onState
        : at === target);
    return widget.checked === checked ? widget : { ...widget, checked };
  });
  const valueEntry: FormValueEntry = scalar(on ? on.onState : 'Off');
  const next =
    field.family === 'checkbox'
      ? {
          ...field,
          widgets: toggles,
          valueEntry,
          checked: toggles.some((widget) => widget.checked),
        }
      : {
          ...field,
          widgets: toggles,
          valueEntry,
          value: toggles.find((widget) => widget.checked)?.exportValue ?? 'Off',
        };
  const states = new Map(
    toggles.map((widget) => [widget.objectNumber, widget.checked ? widget.onState : 'Off']),
  );
  const widgets = current.widgets.map((row) => {
    const state = states.get(objectNumberOf(row.ref));
    return state === undefined || row.appearanceState === state
      ? row
      : { ...row, appearanceState: state };
  });
  return { field: next, widgets };
}

/** The option indexes `values` name, each the first option with that value, in option order. */
function matchedIndexes(options: readonly FormFieldOption[], values: readonly string[]): number[] {
  const indexes = new Set<number>();
  for (const value of values) {
    const at = options.findIndex((option) => option.value === value);
    if (at >= 0) indexes.add(at);
  }
  return [...indexes].sort((left, right) => left - right);
}

const choiceMatches = (
  field: { options: readonly FormFieldOption[] },
  values: readonly string[],
): boolean => values.every((value) => field.options.some((option) => option.value === value));

const freeTextAllowed = (field: FormFieldDTO<Coordinates>, values: readonly string[]): boolean =>
  field.family === 'combobox' && field.edit && values.length === 1;

/** A choice field holding `values`: its options' selection, its value and `/V`. */
function choiceFieldWith<C extends Coordinates>(
  field: Extract<FormFieldDTO<C>, { family: 'combobox' | 'listbox' }>,
  values: readonly string[],
): FormFieldDTO<C> {
  const matched = choiceMatches(field, values) ? matchedIndexes(field.options, values) : [];
  const freeText = values.length > 0 && matched.length === 0;
  const options = field.options.map((option, at) => {
    const selected = matched.includes(at);
    return option.selected === selected ? option : { ...option, selected };
  });
  const chosen = freeText ? [...values] : matched.map((at) => field.options[at]!.value);
  const valueEntry = choiceEntryOf(chosen);
  if (field.family === 'combobox') {
    return { ...field, options, valueEntry, value: chosen[0] ?? '' };
  }
  return { ...field, options, valueEntry, selectedValues: chosen };
}

/** How `/V` (or `/DV`) holds choice values: none, one string, or an array. */
function choiceEntryOf(values: readonly string[]): FormValueEntry {
  if (values.length === 0) return none();
  return values.length === 1 ? scalar(values[0]!) : { kind: 'array', values: [...values] };
}

/** `values` that are option values, in option order. */
function inOptionOrder(options: readonly FormFieldOption[], values: readonly string[]): string[] {
  return matchedIndexes(options, values).map((at) => options[at]!.value);
}

/** A choice field with new options: what is still an option stays selected, and stays its default. */
function withOptions<C extends Coordinates>(
  field: Extract<FormFieldDTO<C>, { family: 'combobox' | 'listbox' }>,
  options: FormFieldOption[],
): FormFieldDTO<C> {
  const exports = options.map((option) => option.value);
  const keepsFreeText = field.family === 'combobox' && field.edit;
  const current =
    field.family === 'combobox' ? (field.value === '' ? [] : [field.value]) : field.selectedValues;
  const kept = keptValues(current, exports, keepsFreeText);
  // A list box's top row stays among its options.
  const listed =
    field.family === 'listbox'
      ? { ...field, options, topIndex: topRowOf(field.topIndex, options) }
      : { ...field, options };
  const reselected = choiceFieldWith(listed, kept);
  const defaults = valuesOfEntry(field.defaultValueEntry);
  if (field.defaultValueEntry.kind === 'none') return reselected;
  const keptDefaults = keptValues(defaults, exports, keepsFreeText);
  return withDefault(
    reselected as Extract<FormFieldDTO<C>, { family: 'combobox' | 'listbox' }>,
    keptDefaults,
    true,
  );
}

/** A list box's top row: an option's position, the last one past the end. */
export function topRowOf(topIndex: number, options: readonly unknown[]): number {
  return Math.max(0, Math.min(topIndex, options.length - 1));
}

/** The values still among `exports`; free text survives when nothing else does. */
function keptValues(
  values: readonly string[],
  exports: readonly string[],
  keepFreeText: boolean,
): string[] {
  const kept = values.filter((value) => exports.includes(value));
  return kept.length === 0 && keepFreeText && values.length > 0 ? [...values] : kept;
}

/**
 * A choice field's default set to `values` (option order; a dropdown's free
 * text as it is). `filtered`: what new options left of the old default,
 * where none left is an empty default rather than no default.
 */
function withDefault<C extends Coordinates>(
  field: Extract<FormFieldDTO<C>, { family: 'combobox' | 'listbox' }>,
  values: readonly string[],
  filtered = false,
): FormFieldDTO<C> {
  if (values.length === 0) {
    const entry: FormValueEntry = !filtered
      ? none()
      : field.family === 'listbox' && field.multiSelect
        ? { kind: 'array', values: [] }
        : scalar('');
    return field.family === 'combobox'
      ? { ...field, defaultValueEntry: entry, defaultValue: '' }
      : { ...field, defaultValueEntry: entry, defaultValue: [] };
  }
  const matched = choiceMatches(field, values);
  const ordered = matched ? inOptionOrder(field.options, values) : [...values];
  const entry = matched ? choiceEntryOf(ordered) : scalar(values[0]!);
  return field.family === 'combobox'
    ? { ...field, defaultValueEntry: entry, defaultValue: ordered[0] ?? '' }
    : { ...field, defaultValueEntry: entry, defaultValue: ordered };
}

function valuesOfEntry(entry: FormValueEntry): string[] {
  if (entry.kind === 'scalar') return [entry.value];
  if (entry.kind === 'array') return [...entry.values];
  return [];
}

/** A new widget's row: its placement and look, and what attaching it to the field gives it. */
function widgetRowOfPlacement(
  draft: FormFieldDraft,
  placement: WidgetPlacement,
  at: { ref: AnnotationRef; field: number; nm: string | undefined },
): WidgetAnnotation {
  const { page: _page, exportValue: _exportValue, ...look } = placement;
  const row = annotationOfDraft(
    { subtype: 'widget', ...look } as Parameters<typeof annotationOfDraft>[0],
    { ref: at.ref, ...(at.nm !== undefined ? { nm: at.nm } : {}) },
  ) as WidgetAnnotation;
  const toggle = draft.family === 'checkbox' || draft.family === 'radio';
  return {
    ...row,
    rect: standingRectOf(row.box, row.rotation),
    field: { kind: 'objectNumber', objectNumber: at.field },
    fieldFamily: draft.family,
    // Attaching the widget prints it and draws its appearance (a signature
    // field's waits for its signature); a checkbox or radio button starts off.
    print: true,
    hasAppearance: draft.family !== 'signature',
    appearanceState: toggle ? 'Off' : null,
    caption: draft.family === 'pushbutton' ? (placement.caption ?? null) : null,
  } as WidgetAnnotation;
}

function toggleWidgetOf(widget: FormFieldWidget, exportValue: string): ToggleFieldWidget {
  return { ...widget, onState: exportValue, exportValue, checked: false };
}

const optionOf = (input: FormFieldOptionInput): FormFieldOption => ({
  label: input.label,
  value: input.value,
  selected: false,
});

const objectNumberOf = (ref: AnnotationRef | Annotation['ref']): number =>
  ref.kind === 'objectNumber' ? ref.objectNumber : 0;

const scalar = (value: string): FormValueEntry => ({ kind: 'scalar', value });
const none = (): FormValueEntry => ({ kind: 'none' });

function notReset(field: FormFieldDTO<Coordinates>): EngineError {
  return new EngineError(EngineErrorCode.Unknown, `'${field.name}' could not be reset`);
}
