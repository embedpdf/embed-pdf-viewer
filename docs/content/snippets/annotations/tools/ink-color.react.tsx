import { useAnnotation, useAnnotationDefaults } from '@embedpdf/react/annotation';

export function InkColor() {
  const annotation = useAnnotation();
  const defaults = useAnnotationDefaults('ink');

  return (
    <input
      type="color"
      value={defaults.color}
      onChange={(event) => annotation.tools.updateDefaults('ink', { color: event.target.value })}
    />
  );
}
