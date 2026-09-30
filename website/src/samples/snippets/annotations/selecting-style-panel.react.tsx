import { useAnnotation, useSelectionFields } from '@embedpdf/react/annotation';
import { Control } from './control'; // your own control

export function StylePanel() {
  const annotation = useAnnotation();
  const { fields, values, mixed } = useSelectionFields();

  return fields.map((field) => (
    <Control
      key={field.key}
      field={field}
      value={values[field.key]}
      mixed={mixed.includes(field.key)}
      onChange={(value) => annotation.selection.update({ [field.key]: value })}
    />
  ));
}
