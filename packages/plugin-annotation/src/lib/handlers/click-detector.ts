import { useState } from '../utils/use-state';
import { PdfAnnotationObject } from '@embedpdf/models';
import { AnnotationTool } from '../tools/types';

interface ClickDetectorOptions<T extends PdfAnnotationObject> {
  threshold?: number;
  getTool: () => AnnotationTool<T> | undefined;
  onClickDetected: (pos: { x: number; y: number }, tool: AnnotationTool<T>) => void;
}

export function useClickDetector<T extends PdfAnnotationObject>({
  threshold = 5,
  getTool,
  onClickDetected,
}: ClickDetectorOptions<T>) {
  const [getStartPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [getHasMoved, setHasMoved] = useState(false);

  return {
    onStart: (pos: { x: number; y: number }) => {
      setStartPos(pos);
      setHasMoved(false);
    },

    onMove: (pos: { x: number; y: number }) => {
      const start = getStartPos();
      if (!start || getHasMoved()) return;

      const distance = Math.sqrt(Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2));

      if (distance > threshold) {
        setHasMoved(true);
      }
    },

    onEnd: (pos: { x: number; y: number }) => {
      const start = getStartPos();
      if (start && !getHasMoved()) {
        const tool = getTool();
        if (tool && 'clickBehavior' in tool && tool.clickBehavior?.enabled) {
          onClickDetected(pos, tool);
        }
      }
      setStartPos(null);
      setHasMoved(false);
    },

    hasMoved: getHasMoved,
    reset: () => {
      setStartPos(null);
      setHasMoved(false);
    },
  };
}
