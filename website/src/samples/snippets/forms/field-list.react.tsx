import { useFormState } from '@embedpdf/react/form';

export function FieldList() {
  const { fields } = useFormState();

  return (
    <ul>
      {fields.map((field) => (
        <li key={field.name}>
          {field.name}: {field.family}
        </li>
      ))}
    </ul>
  );
}
