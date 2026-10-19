import { describe, expect, it, vi } from 'vitest';
import { attachSelectionHandle } from '../src/selection-handles';
import type { SelectionHandleSession } from '../src/selection-handles';

// Fake element (the repo's no-jsdom pattern): listeners captured and fired by
// hand, so the shield, capture tolerance, delta mapping, and teardown are all
// assertable.

function createHarness(
  armResult: () => { base: { x: number; y: number }; session: SelectionHandleSession } | null,
) {
  const listeners = new Map<string, (event: unknown) => void>();
  const captured: number[] = [];
  const element = {
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    setPointerCapture: (id: number) => captured.push(id),
  } as unknown as HTMLElement;
  const arm = vi.fn(armResult);
  const detach = attachSelectionHandle(element, { arm });
  const fire = (type: string, fields: Record<string, unknown>) =>
    listeners.get(type)?.({ preventDefault: vi.fn(), stopPropagation: vi.fn(), ...fields });
  return { listeners, captured, arm, detach, fire };
}

const createSession = () => ({ move: vi.fn(), end: vi.fn() });

describe('attachSelectionHandle', () => {
  it('down arms, shields natively, captures; moves map client deltas from the base', () => {
    const session = createSession();
    const harness = createHarness(() => ({ base: { x: 500, y: 300 }, session }));
    const down = {
      pointerId: 4,
      clientX: 1000,
      clientY: 800,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    harness.listeners.get('pointerdown')!(down);
    expect(down.stopPropagation).toHaveBeenCalled(); // the stage never sees it
    expect(down.preventDefault).toHaveBeenCalled();
    expect(harness.captured).toEqual([4]);
    harness.fire('pointermove', { pointerId: 4, clientX: 1030, clientY: 790 });
    expect(session.move).toHaveBeenCalledWith({ x: 530, y: 290 }); // base + delta
    harness.fire('pointermove', { pointerId: 9, clientX: 0, clientY: 0 }); // foreign pointer
    expect(session.move).toHaveBeenCalledTimes(1);
    harness.fire('pointerup', { pointerId: 4, clientX: 1030, clientY: 790 });
    expect(session.end).toHaveBeenCalledTimes(1);
    harness.fire('pointermove', { pointerId: 4, clientX: 2000, clientY: 2000 });
    expect(session.move).toHaveBeenCalledTimes(1); // drag closed
  });

  it('declined arm: nothing captured, nothing shielded, nothing moves', () => {
    const harness = createHarness(() => null);
    const down = {
      pointerId: 4,
      clientX: 0,
      clientY: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    harness.listeners.get('pointerdown')!(down);
    expect(down.stopPropagation).not.toHaveBeenCalled(); // press falls through
    expect(harness.captured).toEqual([]);
    harness.fire('pointermove', { pointerId: 4, clientX: 10, clientY: 10 });
    expect(harness.arm).toHaveBeenCalledTimes(1);
  });

  it('a throwing setPointerCapture still arms the drag (the scrollbar precedent)', () => {
    const session = createSession();
    const listeners = new Map<string, (event: unknown) => void>();
    const element = {
      addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
      setPointerCapture: () => {
        throw new Error('released pointer');
      },
    } as unknown as HTMLElement;
    attachSelectionHandle(element, { arm: () => ({ base: { x: 0, y: 0 }, session }) });
    listeners.get('pointerdown')!({
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    listeners.get('pointermove')!({ pointerId: 1, clientX: 5, clientY: 5 });
    expect(session.move).toHaveBeenCalledWith({ x: 5, y: 5 });
  });

  it('pointercancel settles like a release, and detach removes every listener', () => {
    const session = createSession();
    const harness = createHarness(() => ({ base: { x: 0, y: 0 }, session }));
    harness.fire('pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
    harness.fire('pointercancel', { pointerId: 2 });
    expect(session.end).toHaveBeenCalledTimes(1);
    harness.detach();
    expect(harness.listeners.size).toBe(0);
  });
});
