import { ref } from 'vue';

type DoublePressOptions = {
  delay?: number; // ms between taps
  tolerancePx?: number; // spatial tolerance
};

type DoubleHandler = ((e: PointerEvent | MouseEvent) => void) | undefined;

type DoubleProps = {
  onDblclick?: (e: MouseEvent) => void;
  onPointerupCapture?: (e: PointerEvent) => void;
};

/**
 * Vue composable for handling double-press/double-tap interactions.
 *
 * @param onDouble - Callback to invoke on double press/tap
 * @param options - Configuration for delay and spatial tolerance
 * @returns Event handler props to be spread on an element with v-bind
 *
 * @example
 * ```vue
 * <script setup>
 * import { useDoublePressProps } from '@embedpdf/utils/vue';
 *
 * const handleDoubleClick = (e) => {
 *   console.log('Double clicked!');
 * };
 *
 * const doubleProps = useDoublePressProps(handleDoubleClick);
 * </script>
 *
 * <template>
 *   <div v-bind="doubleProps">
 *     Double click/tap me
 *   </div>
 * </template>
 * ```
 */
export function useDoublePressProps(
  onDouble?: DoubleHandler,
  { delay = 300, tolerancePx = 18 }: DoublePressOptions = {},
): DoubleProps {
  const last = ref({ t: 0, x: 0, y: 0 });

  const handlePointerUp = (e: PointerEvent) => {
    if (!onDouble) return;

    // Ignore mouse (it will use native dblclick),
    // and ignore non-primary pointers (multi-touch, etc.)
    if (e.pointerType === 'mouse' || e.isPrimary === false) return;

    const now = performance.now();
    const x = e.clientX;
    const y = e.clientY;

    const withinTime = now - last.value.t <= delay;
    const dx = x - last.value.x;
    const dy = y - last.value.y;
    const withinDist = dx * dx + dy * dy <= tolerancePx * tolerancePx;

    if (withinTime && withinDist) {
      onDouble?.(e);
    }

    last.value = { t: now, x, y };
  };

  const handleDouble = (e: MouseEvent) => {
    onDouble?.(e);
  };

  return onDouble
    ? {
        // Vue uses lowercase 'c' in dblclick
        onDblclick: handleDouble,
        onPointerupCapture: handlePointerUp,
      }
    : {};
}
