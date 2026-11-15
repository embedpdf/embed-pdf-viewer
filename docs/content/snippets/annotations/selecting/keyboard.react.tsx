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
      const duplicate = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd';
      if (duplicate && annotation.selection.canDuplicate()) {
        event.preventDefault(); // the browser's bookmark key
        void annotation.selection.duplicate();
      }
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
