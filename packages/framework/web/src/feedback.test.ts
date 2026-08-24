/**
 * The feedback providers, against fake globals (the repo's no-jsdom pattern).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vibrationFeedback, wkFeedback } from './feedback';

describe('feedback providers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('vibrationFeedback maps the three families onto vibrate', () => {
    const calls: Array<number | number[]> = [];
    vi.stubGlobal('navigator', { vibrate: (p: number | number[]) => calls.push(p) });
    vibrationFeedback.selection();
    vibrationFeedback.impact('heavy');
    vibrationFeedback.notify('error');
    expect(calls[0]).toBe(8);
    expect(calls[1]).toBe(30);
    expect(Array.isArray(calls[2])).toBe(true);
  });

  it('vibrationFeedback is a silent no-op without the API (iOS Safari)', () => {
    vi.stubGlobal('navigator', {});
    expect(() => vibrationFeedback.selection()).not.toThrow();
  });

  it('wkFeedback posts families to the host bridge, falls back without one', () => {
    const posted: unknown[] = [];
    vi.stubGlobal('window', {
      webkit: { messageHandlers: { haptics: { postMessage: (m: unknown) => posted.push(m) } } },
    });
    const vibrated: Array<number | number[]> = [];
    vi.stubGlobal('navigator', { vibrate: (p: number | number[]) => vibrated.push(p) });
    const fb = wkFeedback('haptics');
    fb.selection();
    fb.impact('medium');
    expect(posted).toEqual([{ family: 'selection' }, { family: 'impact', weight: 'medium' }]);
    expect(vibrated).toEqual([]);
    vi.stubGlobal('window', {}); // bridge gone -> vibration fallback
    fb.notify('success');
    expect(vibrated.length).toBe(1);
  });
});
