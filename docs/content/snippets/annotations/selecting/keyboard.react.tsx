import { useEffect } from 'react';
import { useAnnotation } from '@embedpdf/react/annotation';
import { useInteraction } from '@embedpdf/react/interaction';

export function AnnotationKeys() {
  const annotation = useAnnotation();
  const interaction = useInteraction();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || annotation.text.getEditing()) return;
      if (event.key === 'Delete' || event.key === 'Backspace') void annotation.selection.delete();
      if (event.key === 'Escape') {
        annotation.cancel(); // a drag or a polygon in progress
        interaction.activateDefaultTool();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [annotation, interaction]);

  return null;
}
