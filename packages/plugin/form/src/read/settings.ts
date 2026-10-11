/**
 * A field's settings, described for a settings panel the way an annotation
 * kind describes its look: which settings the field's family has, how each is
 * edited, and its value. `update()` writes them.
 */
import { memoByKey } from '@embedpdf/core';
import type { FormFieldDTO, FormFieldRef } from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFieldSetting, FormFieldSettings } from '../contract';
import { canonicalKey, fieldByKey } from '../model';
import type { FormServices } from '../services';

/** What every field has. */
const COMMON: readonly FormFieldSetting[] = [
  { key: 'name', control: 'text', label: 'Name' },
  { key: 'alternateName', control: 'text', label: 'Tooltip' },
  { key: 'required', control: 'flag', label: 'Required' },
  { key: 'readOnly', control: 'flag', label: 'Read-only' },
  { key: 'noExport', control: 'flag', label: "Don't export" },
];

/** What each family adds. */
function familySettings(field: FormFieldDTO): readonly FormFieldSetting[] {
  switch (field.family) {
    case 'text':
      return [
        { key: 'defaultValue', control: 'text', label: 'Default value' },
        { key: 'maxLength', control: 'number', label: 'Maximum length', min: 1 },
        { key: 'multiline', control: 'flag', label: 'Several lines' },
        { key: 'password', control: 'flag', label: 'Password' },
        { key: 'comb', control: 'flag', label: 'One character per box' },
      ];
    case 'radio':
      return [
        {
          key: 'radiosInUnison',
          control: 'flag',
          label: 'Buttons with one value turn on together',
        },
        { key: 'noToggleToOff', control: 'flag', label: 'Keep one on' },
      ];
    case 'combobox':
      return [
        { key: 'options', control: 'options', label: 'Options' },
        { key: 'edit', control: 'flag', label: 'Allow typing' },
        {
          key: 'defaultValue',
          control: 'choice',
          label: 'Default value',
          options: field.options.map((option) => option.value),
          free: field.edit,
        },
      ];
    case 'listbox':
      return [
        { key: 'options', control: 'options', label: 'Options' },
        { key: 'multiSelect', control: 'flag', label: 'Several choices' },
        {
          key: 'defaultValue',
          control: 'choices',
          label: 'Default value',
          options: field.options.map((option) => option.value),
        },
      ];
    default:
      return [];
  }
}

/** Each setting's value, as the field holds it. */
function valuesOf(
  field: FormFieldDTO,
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

export function createFieldSettings({ fields }: Pick<FormServices, 'fields'>) {
  const settingsByKey = memoByKey(
    (key: string) => [fieldByKey(fields.view(), key)],
    (_key, field): FormFieldSettings | null => {
      if (!field) return null;
      const properties = [...COMMON, ...familySettings(field)];
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
