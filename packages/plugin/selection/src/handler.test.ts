/**
 * The text-select handler's gesture routing — in particular the haptic
 * trigger: the platform's selection tick fires ONLY when a touch long-press
 * actually engages a word. Mouse double-clicks are silent, blank space is
 * silent, and the marker (never pointerType sniffing) is the signal.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  InteractionCapability,
  PlatformFeedback,
  PointerSample,
} from '@embedpdf/plugin-interaction';
import { createTextSelectHandler } from './handler';
import type { SelectionHostCapability } from './types';

const interaction = { setCursor: () => {} } as unknown as InteractionCapability;

function makeSelection(overText = true) {
  const calls: string[] = [];
  const selection = {
    clear: () => calls.push('clear'),
    isOverText: () => overText,
    selectWordAt: () => {
      calls.push('word');
      return overText; // success mirrors "there was text there"
    },
    selectLineAt: () => {
      calls.push('line');
      return overText;
    },
    beginAt: () => true,
    extendTo: () => calls.push('extend'),
    end: () => calls.push('end'),
  } as unknown as SelectionHostCapability;
  return { selection, calls };
}

const makeFeedback = () => {
  const feedback: PlatformFeedback = {
    selection: vi.fn(),
    impact: vi.fn(),
    notify: vi.fn(),
  };
  return feedback;
};

const down = (over: Partial<PointerSample> = {}): PointerSample => ({
  phase: 'down',
  viewport: { x: 10, y: 10 },
  page: { pon: 1, point: { x: 100, y: 200 } },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  ...over,
});

describe('text-select handler — haptic trigger', () => {
  it('long-press engaging a word fires the selection tick, once', () => {
    const { selection } = makeSelection(true);
    const feedback = makeFeedback();
    const h = createTextSelectHandler(selection, interaction, feedback);
    expect(h.onDown(down({ clickCount: 2, pointerType: 'touch', gesture: 'long-press' }))).toBe(
      true,
    );
    expect(feedback.selection).toHaveBeenCalledTimes(1);
    expect(feedback.impact).not.toHaveBeenCalled();
  });

  it('a MOUSE double-click never buzzes — no marker, no tick', () => {
    const { selection } = makeSelection(true);
    const feedback = makeFeedback();
    const h = createTextSelectHandler(selection, interaction, feedback);
    h.onDown(down({ clickCount: 2, pointerType: 'mouse' }));
    expect(feedback.selection).not.toHaveBeenCalled();
  });

  it('a TOUCH double-click sample without the marker never buzzes either', () => {
    // PageView's raw pointer source can produce touch + clickCount 2 from two
    // fast taps — only the recognized long-press carries the marker.
    const { selection } = makeSelection(true);
    const feedback = makeFeedback();
    const h = createTextSelectHandler(selection, interaction, feedback);
    h.onDown(down({ clickCount: 2, pointerType: 'touch' }));
    expect(feedback.selection).not.toHaveBeenCalled();
  });

  it('long-press over blank space selects nothing and stays silent', () => {
    const { selection } = makeSelection(false); // no text under the point
    const feedback = makeFeedback();
    const h = createTextSelectHandler(selection, interaction, feedback);
    h.onDown(down({ clickCount: 2, pointerType: 'touch', gesture: 'long-press' }));
    expect(feedback.selection).not.toHaveBeenCalled();
  });

  it('no feedback capability registered → everything still routes', () => {
    const { selection, calls } = makeSelection(true);
    const h = createTextSelectHandler(selection, interaction);
    expect(h.onDown(down({ clickCount: 2, gesture: 'long-press' }))).toBe(true);
    expect(calls).toContain('word');
  });
});
