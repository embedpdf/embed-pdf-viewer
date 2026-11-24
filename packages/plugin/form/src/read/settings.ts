/**
 * A field's settings, described for a settings panel the way an annotation
 * kind describes its look: which settings the field's kind has, how each is
 * edited, and its value. `update()` writes them. While the document has
 * groups, a field's group is one of them: the choices are the groups the
 * user may put a field in, and the one the field is in.
 */
import { memoByKey } from '@embedpdf/core';
import type { FormField, FormFieldRef } from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFieldSetting, FormFieldSettings, FormGroup } from '../contract';
import { canonicalKey, fieldByKey } from '../model';
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

export function createFieldSettings({ fields, groups }: Pick<FormServices, 'fields' | 'groups'>) {
  const settingsByKey = memoByKey(
    (key: string) => [fieldByKey(fields.view(), key), groups.list()] as const,
    (_key, field, listed): FormFieldSettings | null => {
      if (!field) return null;
      const properties = [
        ...COMMON,
        ...groupSetting(field, listed, groups.maySet),
        ...familySettings(field),
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
