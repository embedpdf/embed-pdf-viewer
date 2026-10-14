import { useAnnotationDefaults } from '@embedpdf/react/annotation';
import { useToolCursor } from '@embedpdf/react/interaction';

import { penIcon } from './icons';

export function InkCursor() {
  const { color } = useAnnotationDefaults('ink');
  useToolCursor({
    toolId: 'ink',
    cursors: { crosshair: { svg: penIcon(color), hotspot: { x: 2, y: 22 } } },
  });
  return null;
}
