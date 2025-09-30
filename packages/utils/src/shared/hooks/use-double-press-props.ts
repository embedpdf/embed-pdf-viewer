import { useRef, useCallback, dblClickProp } from '@framework';
import type { PointerEvent } from '@framework';

type DoublePressOptions = {
  delay?: number; // ms between taps
  tolerancePx?: number; // spatial tolerance
};

type DoubleHandler<T extends Element> = ((e: PointerEvent<T> | MouseEvent) => void) | undefined;

type DoubleProps<K extends string> = Partial<Record<K, (e: any) => void>> & {
  onPointerUp?: (e: any) => void;
};

export function useDoublePressProps<
  T extends Element = Element,
  K extends string = typeof dblClickProp,
>(
  onDouble?: DoubleHandler<T>,
  { delay = 300, tolerancePx = 18 }: DoublePressOptions = {},
): DoubleProps<K> {
  const last = useRef({ t: 0, x: 0, y: 0 });

  const handlePointerUp = useCallback(
    (e: any) => {
      if (!onDouble) return;

      // Ignore mouse (it will use native dblclick),
      // and ignore non-primary pointers (multi-touch, etc.)
      if (e.pointerType === 'mouse' || e.isPrimary === false) return;

      const now = performance.now();
      const x = e.clientX as number;
      const y = e.clientY as number;

      const withinTime = now - last.current.t <= delay;
      const dx = x - last.current.x;
      const dy = y - last.current.y;
      const withinDist = dx * dx + dy * dy <= tolerancePx * tolerancePx;

      if (withinTime && withinDist) onDouble?.(e as PointerEvent<T>);

      last.current = { t: now, x, y };
    },
    [onDouble, delay, tolerancePx],
  );

  const handleDouble = useCallback(
    (e: any) => {
      onDouble?.(e);
    },
    [onDouble],
  );

  return onDouble
    ? ({
        // Computed property uses the framework’s name ('onDoubleClick' or 'onDblClick')
        [dblClickProp]: handleDouble,
        onPointerUpCapture: handlePointerUp,
      } as DoubleProps<K>)
    : {};
}
