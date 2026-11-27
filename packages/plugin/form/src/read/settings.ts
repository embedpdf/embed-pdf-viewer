/**
 * A field's settings, described for a settings panel the way an annotation
 * kind describes its look: which settings the field's kind has, how each is
 * edited, and its value. `update()` writes them. While the document has
 * groups, a field's group is one of them: the choices are the groups the
 * user may put a field in, and the one the field is in. So are what the field
 * is for (its purpose: the ones the plugin knows, and the field's own) and,
 * for a text field and a dropdown, the shape of its value (its format: a date
 * or a time with a pattern).
 */
import { memoByKey } from '@embedpdf/core';
import {
  assignmentsEqual,
  STANDARD_DATE_PATTERNS,
  STANDARD_TIME_PATTERNS,
  takesFormat,
  type FieldAssignment,
  type FormField,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';

import type {
  FormCapability,
  FormFieldSetting,
  FormFieldSettings,
  FormGroup,
  FormPurpose,
} from '../contract';
import { ANYONE, canonicalKey, fieldByKey, UNASSIGNED } from '../model';
import type { FormServices } from '../services';

/** What every field has. */
const COMMON: readonly FormFieldSetting[] = [
  { key: 'name', control: 'text', label: 'Name', labelKey: 'form.settings.name' },
  { key: 'alternateName', control: 'text', label: 'Tooltip', labelKey: 'form.settings.tooltip' },
  { key: 'required', control: 'flag', label: 'Required', labelKey: 'form.settings.required' },
  { key: 'readOnly', control: 'flag', label: 'Read-only', labelKey: 'form.settings.readOnly' },
  { key: 'noExport', control: 'flag', label: "Don't export", labelKey: 'form.settings.noExport' },
];

const DEFAULT_VALUE = { label: 'Default value', labelKey: 'form.settings.defaultValue' } as const;
const OPTIONS: FormFieldSetting = {
  key: 'options',
  control: 'options',
  label: 'Options',
  labelKey: 'form.settings.options',
};

/** What each kind adds. */
function familySettings(field: FormField): readonly FormFieldSetting[] {
  switch (field.kind) {
    case 'text':
      return [
        { key: 'defaultValue', control: 'text', ...DEFAULT_VALUE },
        {
          key: 'maxLength',
          control: 'number',
          label: 'Maximum length',
          labelKey: 'form.settings.maxLength',
          min: 1,
        },
        {
          key: 'multiline',
          control: 'flag',
          label: 'Several lines',
          labelKey: 'form.settings.multiline',
        },
        { key: 'password', control: 'flag', label: 'Password', labelKey: 'form.settings.password' },
        {
          key: 'comb',
          control: 'flag',
          label: 'One character per box',
          labelKey: 'form.settings.comb',
        },
      ];
    case 'radio':
      return [
        {
          key: 'radiosInUnison',
          control: 'flag',
          label: 'Buttons with one value turn on together',
          labelKey: 'form.settings.radiosInUnison',
        },
        {
          key: 'noToggleToOff',
          control: 'flag',
          label: 'Keep one on',
          labelKey: 'form.settings.keepOneOn',
        },
      ];
    case 'combobox':
      return [
        OPTIONS,
        {
          key: 'edit',
          control: 'flag',
          label: 'Allow typing',
          labelKey: 'form.settings.allowTyping',
        },
        {
          key: 'defaultValue',
          control: 'choice',
          ...DEFAULT_VALUE,
          options: field.options.map((option) => option.value),
          free: field.edit,
        },
      ];
    case 'listbox':
      return [
        OPTIONS,
        {
          key: 'multiSelect',
          control: 'flag',
          label: 'Several choices',
          labelKey: 'form.settings.multiSelect',
        },
        {
          key: 'defaultValue',
          control: 'choices',
          ...DEFAULT_VALUE,
          options: field.options.map((option) => option.value),
        },
      ];
    default:
      return [];
  }
}

/**
 * Who fills the field in, among the document's groups: the ones the user may put a field in,
 * and the field's own. Nothing while the document has no groups.
 */
function groupSetting(
  field: FormField,
  groups: readonly FormGroup[],
  maySet: (groupId: string) => boolean,
): readonly FormFieldSetting[] {
  if (groups.length === 0) return [];
  return [
    {
      key: 'groupId',
      control: 'choice',
      label: 'Filled in by',
      labelKey: 'form.settings.group',
      options: groups
        .filter((group) => group.id === field.groupId || maySet(group.id))
        .map((group) => group.id),
      free: false,
    },
  ];
}

/**
 * Who fills the field in, whole: nobody, each of the document's groups, and anyone, those the
 * user may give it, and the field's own; anyone never on a signature field, which one signer
 * signs. Nothing while there is no other to choose.
 */
function assignmentSetting(
  field: FormField,
  groups: readonly FormGroup[],
  mayAssign: (assignment: FieldAssignment) => boolean,
): readonly FormFieldSetting[] {
  const candidates: FieldAssignment[] = [
    UNASSIGNED,
    ...groups.map((group): FieldAssignment => ({ kind: 'group', groupId: group.id })),
    ...(field.kind === 'signature' ? [] : [ANYONE]),
  ];
  const options = candidates.filter(
    (assignment) => assignmentsEqual(assignment, field.assignment) || mayAssign(assignment),
  );
  if (!options.some((assignment) => assignmentsEqual(assignment, field.assignment))) {
    options.push(field.assignment);
  }
  if (options.length < 2) return [];
  return [
    {
      key: 'assignment',
      control: 'assignment',
      label: 'Filled in by',
      labelKey: 'form.settings.assignment',
      options,
    },
  ];
}

/**
 * What the field is for, among the purposes the plugin knows, and the field's own when it is
 * another word.
 */
function purposeSetting(
  field: FormField,
  purposes: readonly FormPurpose[],
): readonly FormFieldSetting[] {
  const options = purposes.map((purpose) => purpose.id);
  if (field.purpose !== null && !options.includes(field.purpose)) options.push(field.purpose);
  return [
    {
      key: 'purpose',
      control: 'choice',
      label: 'Purpose',
      labelKey: 'form.settings.purpose',
      options,
      free: false,
    },
  ];
}

const FORMAT_KINDS = Object.freeze(['date', 'time'] as const);
const FORMAT_PATTERNS = Object.freeze({
  date: STANDARD_DATE_PATTERNS,
  time: STANDARD_TIME_PATTERNS,
});

/**
 * The shape of a text field's or a dropdown's value: a date or a time, with the patterns
 * Acrobat offers for each. Nothing for another kind.
 */
function formatSetting(field: FormField): readonly FormFieldSetting[] {
  if (!takesFormat(field.kind)) return [];
  return [
    {
      key: 'format',
      control: 'format',
      label: 'Format',
      labelKey: 'form.settings.format',
      kinds: FORMAT_KINDS,
      patterns: FORMAT_PATTERNS,
    },
  ];
}

/** Each setting's value, as the field holds it. */
function valuesOf(
  field: FormField,
  settings: readonly FormFieldSetting[],
): Record<string, unknown> {
  const held = field as unknown as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const { key } of settings) {
    if (key === 'name') values.name = field.name.slice(field.name.lastIndexOf('.') + 1);
    else if (key === 'alternateName') values.alternateName = field.alternateName ?? '';
    else values[key] = held[key] ?? null;
  }
  return values;
}

export function createFieldSettings({
  fields,
  groups,
  purposes,
}: Pick<FormServices, 'fields' | 'groups' | 'purposes'>) {
  const settingsByKey = memoByKey(
    (key: string) =>
      [
        fieldByKey(fields.view(), key),
        groups.list(),
        purposes.list(),
        groups.mayAssign(ANYONE),
      ] as const,
    (_key, field, listed, known): FormFieldSettings | null => {
      if (!field) return null;
      const properties = [
        ...COMMON,
        ...groupSetting(field, listed, groups.maySet),
        ...assignmentSetting(field, listed, groups.mayAssign),
        ...purposeSetting(field, known),
        ...familySettings(field),
        ...formatSetting(field),
      ];
      return { properties, values: valuesOf(field, properties) };
    },
    { maxEntries: 256 },
  );
  return {
    api: {
      getFieldSettings: (ref: FormFieldRef) => settingsByKey(canonicalKey(fields.view(), ref)),
    } satisfies Partial<FormCapability>,
  };
}
