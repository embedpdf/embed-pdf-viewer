import { useAnnotation, useAnnotationProperties } from '@embedpdf/react/annotation';
import { Control } from './control'; // your own control

export function StylePanel() {
  const annotation = useAnnotation();
  const { properties, values, mixed } = useAnnotationProperties();

  return properties.map((property) => (
    <Control
      key={property.key}
      property={property}
      value={values[property.key]}
      mixed={mixed.includes(property.key)}
      onChange={(value) => annotation.selection.update({ [property.key]: value })}
    />
  ));
}
