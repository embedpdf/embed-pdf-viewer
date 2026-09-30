import { useForm, useFormState } from '@embedpdf/react/form';

export function FieldSettings() {
  const form = useForm();
  const { selectedField: field } = useFormState();
  if (!field) return null;

  return (
    <>
      <input defaultValue={field.name} onBlur={(e) => form.update(field.ref, { name: e.target.value })} />
      <label>
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => form.update(field.ref, { required: e.target.checked })}
        />
        Required
      </label>
    </>
  );
}
