import { useToolCursor } from '@embedpdf/react/interaction';
import { penIcon } from './icons';

export function PenCursor({ color }: { color: string }) {
  useToolCursor({ toolId: 'ink', cursors: { crosshair: { svg: penIcon(color), hotspot: { x: 2, y: 22 } } } });
  return null;
}
