import { useAnnotationEvent } from '@embedpdf/react/annotation';

import { saveStyle } from './styles';

export function SaveStyles() {
  useAnnotationEvent(
    (annotation) => annotation.tools.onDefaultsChanged,
    ({ toolId, defaults }) => saveStyle(toolId, defaults),
  );

  return null;
}
