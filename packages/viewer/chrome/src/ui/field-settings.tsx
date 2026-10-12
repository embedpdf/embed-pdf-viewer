/**
 * The style panel's Field section: the settings of the one field whose widget
 * is selected in design mode, as the form plugin describes them
 * (`getFieldSettings`), written with `form.update()`. Nothing here knows a
 * field family: the description says what to draw.
 */
import { FormToken, type FormFieldPatch, type FormFieldSetting } from '@embedpdf/react/form';
import { useT } from '@embedpdf/react/i18n';
import { useOptionalCapability, useOptionalSelector } from '@embedpdf/react/runtime';
import { useEffect, useState } from 'react';

const inputClass = 'border-border bg-surface text-fg w-full rounded-md border px-2 py-1.5 text-sm';

/** One option of a dropdown or a list, as its settings hold it. */
interface Option {
  readonly label: string;
  readonly value: string;
}

export function FieldSettingsSection() {
  const t = useT();
  const form = useOptionalCapability(FormToken);
  const field = useOptionalSelector(FormToken, (capability) => capability.getSelectedField(), null);
  const settings = useOptionalSelector(
    FormToken,
    (capability) => (field ? capability.getFieldSettings(field.ref) : null),
    null,
  );
  if (!form || !field || !settings || !form.canDesign()) return null;
  const write = (patch: Record<string, unknown>) =>
    void form.update(field.ref, patch as FormFieldPatch).catch(() => undefined);

  return (
    <div className="border-border-subtle mt-4 border-t pt-4">
      <p className="text-fg-muted mb-3 text-[11px] font-semibold uppercase tracking-wide">
        {t('demo.fieldSettingsTitle')}
      </p>
      {settings.properties.map((spec) => (
        <SettingControl
          key={`${spec.key}:${spec.control}`}
          fieldKey={JSON.stringify(field.ref)}
          spec={spec}
          value={settings.values[spec.key]}
          onChange={(value) => write({ [spec.key]: value })}
        />
      ))}
    </div>
  );
}

function SettingControl({
  fieldKey,
  spec,
  value,
  onChange,
}: {
  /** The field it edits: a draft starts over when the selection moves to another field. */
  fieldKey: string;
  spec: FormFieldSetting;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const t = useT();
  switch (spec.control) {
    case 'flag':
      return (
        <label className="text-fg mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          {spec.label}
        </label>
      );
    case 'text':
      return (
        <Setting label={spec.label}>
          <CommittedInput
            key={fieldKey}
            value={typeof value === 'string' ? value : ''}
            onCommit={onChange}
          />
        </Setting>
      );
    case 'number':
      return (
        <Setting label={spec.label}>
          <CommittedInput
            key={fieldKey}
            type="number"
            min={spec.min}
            placeholder={t('demo.fieldNone')}
            value={typeof value === 'number' ? String(value) : ''}
            onCommit={(text) => onChange(text === '' ? null : Math.max(spec.min, Number(text)))}
          />
        </Setting>
      );
    case 'choice':
      return spec.free ? (
        <Setting label={spec.label}>
          <CommittedInput
            key={fieldKey}
            list={`${fieldKey}-choices`}
            value={typeof value === 'string' ? value : ''}
            onCommit={onChange}
          />
          <datalist id={`${fieldKey}-choices`}>
            {spec.options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </Setting>
      ) : (
        <Setting label={spec.label}>
          <select
            className={inputClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          >
            <option value="">{t('demo.fieldNone')}</option>
            {spec.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Setting>
      );
    case 'choices': {
      const chosen = new Set(Array.isArray(value) ? (value as string[]) : []);
      return (
        <Setting label={spec.label}>
          {spec.options.map((option) => (
            <label key={option} className="text-fg mb-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.has(option)}
                onChange={(event) =>
                  onChange(
                    spec.options.filter((each) =>
                      each === option ? event.target.checked : chosen.has(each),
                    ),
                  )
                }
              />
              {option}
            </label>
          ))}
        </Setting>
      );
    }
    case 'options':
      return (
        <Setting label={spec.label}>
          <OptionsEditor
            key={fieldKey}
            options={Array.isArray(value) ? (value as Option[]) : []}
            onCommit={onChange}
          />
        </Setting>
      );
  }
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <span className="text-fg mb-1 block text-sm font-medium">{label}</span>
      {children}
    </section>
  );
}

/** A text input that writes on blur or Enter, and keeps what's typed until then. */
function CommittedInput({
  value,
  onCommit,
  ...input
}: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft === null || draft === value) return;
    onCommit(draft);
  };
  return (
    <input
      {...input}
      className={inputClass}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && commit()}
    />
  );
}

/** A dropdown's or list's options, each a label and a value; written as a whole on each edit. */
function OptionsEditor({
  options,
  onCommit,
}: {
  options: readonly Option[];
  onCommit: (options: Option[]) => void;
}) {
  const t = useT();
  const rows = options.map((option) => ({ label: option.label, value: option.value }));
  const replace = (at: number, row: Option | null) =>
    onCommit(
      row === null
        ? rows.filter((_, index) => index !== at)
        : rows.map((each, index) => (index === at ? row : each)),
    );
  return (
    <div>
      {rows.map((row, at) => (
        <div key={`${at}:${row.value}`} className="mb-1 flex gap-1">
          <CommittedInput
            aria-label={t('demo.fieldOptionLabel')}
            value={row.label}
            onCommit={(label) => replace(at, { ...row, label })}
          />
          <CommittedInput
            aria-label={t('demo.fieldOptionValue')}
            value={row.value}
            onCommit={(value) => replace(at, { ...row, value })}
          />
          <button
            type="button"
            title={t('demo.fieldOptionRemove')}
            className="text-fg-muted hover:text-fg px-1"
            onClick={() => replace(at, null)}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-accent text-sm"
        onClick={() => {
          const label = `Option ${rows.length + 1}`;
          onCommit([...rows, { label, value: label }]);
        }}
      >
        {t('demo.fieldOptionAdd')}
      </button>
    </div>
  );
}
