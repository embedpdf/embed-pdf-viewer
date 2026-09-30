import { useAnnotationEvent } from '@embedpdf/react/annotation';

export function RememberDefaults() {
  useAnnotationEvent(
    (annotation) => annotation.tools.onDefaultsChanged,
    ({ toolId, defaults }) => {
      localStorage.setItem(`tool:${toolId}`, JSON.stringify(defaults));
    },
  );

  return null;
}
