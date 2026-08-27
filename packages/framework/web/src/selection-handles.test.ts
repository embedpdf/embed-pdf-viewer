import { describe, expect, it, vi } from 'vitest';
import { attachSelectionHandle } from './selection-handles';
import type { SelectionHandleSession } from './selection-handles';

// Fake element (the repo's no-jsdom pattern): listeners captured and fired by
// hand, so the shield, capture tolerance, delta mapping, and teardown are all
// assertable.

function harness(armResult: () => { base: { x: number; y: number }; session: SelectionHandleSession } | null) {
  const listeners = new Map<string, (e: unknown) => void>();
  const captured: number[] = [];
  const el = {
    addEventListener: (t: string, fn: (e: unknown) => void) => listeners.set(t, fn),
    removeEventListener: (t: string) => listeners.delete(t),
    setPointerCapture: (id: number) => captured.push(id),
  } as unknown as HTMLElement;
  const arm = vi.fn(armResult);
  const detach = attachSelectionHandle(el, { arm });
  const fire = (type: string, e: Record<string, unknown>) =>
    listeners.get(type)?.({ preventDefault: vi.fn(), stopPropagation: vi.fn(), ...e });
  return { listeners, captured, arm, detach, fire };
}

const session = () => ({ move: vi.fn(), end: vi.fn() });

describe('attachSelectionHandle', () => {
  it('down arms, shields natively, captures; moves map client deltas from the base', () => {
    const s = session();
    const h = harness(() => ({ base: { x: 500, y: 300 }, session: s }));
    const down = { pointerId: 4, clientX: 1000, clientY: 800, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    h.listeners.get('pointerdown')!(down);
    expect(down.stopPropagation).toHaveBeenCalled(); // the stage never sees it
    expect(down.preventDefault).toHaveBeenCalled();
    expect(h.captured).toEqual([4]);
    h.fire('pointermove', { pointerId: 4, clientX: 1030, clientY: 790 });
    expect(s.move).toHaveBeenCalledWith({ x: 530, y: 290 }); // base + delta
    h.fire('pointermove', { pointerId: 9, clientX: 0, clientY: 0 }); // foreign pointer
    expect(s.move).toHaveBeenCalledTimes(1);
    h.fire('pointerup', { pointerId: 4, clientX: 1030, clientY: 790 });
    expect(s.end).toHaveBeenCalledTimes(1);
    h.fire('pointermove', { pointerId: 4, clientX: 2000, clientY: 2000 });
    expect(s.move).toHaveBeenCalledTimes(1); // drag closed
  });

  it('declined arm: nothing captured, nothing shielded, nothing moves', () => {
    const h = harness(() => null);
    const down = { pointerId: 4, clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    h.listeners.get('pointerdown')!(down);
    expect(down.stopPropagation).not.toHaveBeenCalled(); // press falls through
    expect(h.captured).toEqual([]);
    h.fire('pointermove', { pointerId: 4, clientX: 10, clientY: 10 });
    expect(h.arm).toHaveBeenCalledTimes(1);
  });

  it('a throwing setPointerCapture still arms the drag (the scrollbar precedent)', () => {
    const s = session();
    const listeners = new Map<string, (e: unknown) => void>();
    const el = {
      addEventListener: (t: string, fn: (e: unknown) => void) => listeners.set(t, fn),
      removeEventListener: (t: string) => listeners.delete(t),
      setPointerCapture: () => {
        throw new Error('released pointer');
      },
    } as unknown as HTMLElement;
    attachSelectionHandle(el, { arm: () => ({ base: { x: 0, y: 0 }, session: s }) });
    listeners.get('pointerdown')!({
      pointerId: 1, clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    });
    listeners.get('pointermove')!({ pointerId: 1, clientX: 5, clientY: 5 });
    expect(s.move).toHaveBeenCalledWith({ x: 5, y: 5 });
  });

  it('pointercancel settles like a release, and detach removes every listener', () => {
    const s = session();
    const h = harness(() => ({ base: { x: 0, y: 0 }, session: s }));
    h.fire('pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
    h.fire('pointercancel', { pointerId: 2 });
    expect(s.end).toHaveBeenCalledTimes(1);
    h.detach();
    expect(h.listeners.size).toBe(0);
  });
});
