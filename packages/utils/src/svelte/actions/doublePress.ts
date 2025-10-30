
export type DoublePressOptions = {
  delay?: number;        // ms between taps
  tolerancePx?: number;  // spatial tolerance
  onDouble?: (e: PointerEvent | MouseEvent) => void;
};

export function doublePress<T extends Element = Element>(
  node: T,
  options: DoublePressOptions = {}
) {
  let { onDouble, delay = 300, tolerancePx = 18 } = options;

  // last pointerup (time & position)
  const last = { t: 0, x: 0, y: 0 };

  const handlePointerUp = (e: Event) => {
    const ev = e as PointerEvent;
    if (!onDouble) return;

    // ignore mouse (mouse uses native dblclick)
    // ignore non-primary pointers (multi-touch, etc.)
    if (ev.pointerType === 'mouse' || ev.isPrimary === false) return;

    const now = performance.now();
    const x = ev.clientX;
    const y = ev.clientY;

    const withinTime = now - last.t <= delay;
    const dx = x - last.x;
    const dy = y - last.y;
    const withinDist = dx * dx + dy * dy <= tolerancePx * tolerancePx;

    if (withinTime && withinDist) onDouble?.(ev);

    last.t = now;
    last.x = x;
    last.y = y;
  };

  const handleDblClick = (e: Event) => {
    onDouble?.(e as MouseEvent);
  };

  node.addEventListener('pointerup', handlePointerUp, { capture: true });
  node.addEventListener('dblclick', handleDblClick);

  return {
    update(next?: DoublePressOptions) {
      if (!next) return;
      onDouble = next.onDouble;
      // use nullish coalescing so 0 isn't swallowed accidentally (even though 0 isn't useful here)
      delay = next.delay ?? delay;
      tolerancePx = next.tolerancePx ?? tolerancePx;
    },
    destroy() {
      node.removeEventListener('pointerup', handlePointerUp, { capture: true } as any);
      node.removeEventListener('dblclick', handleDblClick);
    }
  };
}