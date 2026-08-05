/**
 * The edit handler's page anchoring: a gesture belongs to the page it started
 * on. Moves resolve through the source's projection onto THAT page (so the
 * annotation keeps tracking — sliding along the edge — when the cursor leaves
 * it), foreign-page samples are ignored, and `up` ALWAYS closes the gesture
 * (a release over the page gap used to strand the move draft, so the
 * annotation snapped back on the next interaction).
 */
import { describe, expect, it, vi } from 'vitest';
import type { InteractionCapability, PointerSample } from '@embedpdf/plugin-interaction';
import type { Vec } from '@embedpdf/core-annotation';
import { createDrawHandler, createEditHandler, createGhostHandler } from './handler';
import type { AnnotationHostCapability } from './types';

const PAGE_1 = 1;
const PAGE_2 = 2;

type Call = { phase: string; pon: number; point: Vec };

function makeAnno(hit: 'annot' | 'empty' = 'annot') {
  const calls: Call[] = [];
  const anno = {
    currentEditing: () => null,
    endTextEdit: () => {},
    hitKind: () => hit,
    deselect: () => {},
    beginTextEditAt: () => {},
    cursorAt: () => null,
    editPointer: (phase: string, pon: number, point: Vec) => calls.push({ phase, pon, point }),
  } as unknown as AnnotationHostCapability;
  return { anno, calls };
}

const interaction = { setCursor: () => {} } as unknown as InteractionCapability;

const sample = (over: Partial<PointerSample>): PointerSample => ({
  phase: 'move',
  viewport: { x: 0, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  ...over,
});

const down = () => sample({ phase: 'down', page: { pon: PAGE_1, point: { x: 300, y: 730 } } });

describe('annotation edit handler — page anchoring', () => {
  it('tracks the ORIGIN page through the projection, not the page under the cursor', () => {
    const { anno, calls } = makeAnno();
    const h = createEditHandler(anno, interaction);
    expect(h.onDown(down())).toBe(true);
    // The cursor is physically over page 2 (its local y ≈ 18); the projection
    // onto page 1 says y = 810 (past its bottom edge — unclamped, as expected).
    h.onMove?.(
      sample({
        page: { pon: PAGE_2, point: { x: 300, y: 18 } },
        project: (pon) => (pon === PAGE_1 ? { x: 300, y: 810 } : null),
      }),
    );
    expect(calls.at(-1)).toEqual({ phase: 'move', pon: PAGE_1, point: { x: 300, y: 810 } });
  });

  it('ignores a sample that cannot speak for the origin page (foreign per-page source)', () => {
    const { anno, calls } = makeAnno();
    const h = createEditHandler(anno, interaction);
    h.onDown(down());
    const before = calls.length;
    h.onMove?.(sample({ page: { pon: PAGE_2, point: { x: 300, y: 18 } }, project: () => null }));
    expect(calls.length).toBe(before);
  });

  it('ALWAYS dispatches up — release over the page gap must still commit', () => {
    const { anno, calls } = makeAnno();
    const h = createEditHandler(anno, interaction);
    h.onDown(down());
    h.onMove?.(sample({ project: (pon) => (pon === PAGE_1 ? { x: 300, y: 780 } : null) }));
    // Over the gap: no page hit, and (worst case) no projection either.
    h.onUp?.(sample({ phase: 'up' }));
    expect(calls.at(-1)).toEqual({ phase: 'up', pon: PAGE_1, point: { x: 300, y: 780 } });
  });

  it('a gesture that never armed (empty hit) routes nothing on move/up', () => {
    const { anno, calls } = makeAnno('empty');
    const h = createEditHandler(anno, interaction);
    expect(h.onDown(down())).toBe(false);
    h.onMove?.(sample({ page: { pon: PAGE_1, point: { x: 10, y: 10 } } }));
    h.onUp?.(sample({ phase: 'up', page: { pon: PAGE_1, point: { x: 10, y: 10 } } }));
    expect(calls.length).toBe(0);
  });
});

describe('annotation ghost handler — hover footprint', () => {
  function makeGhostAnno() {
    const hovers: Array<{ toolId: string; pon: number; point: Vec; rotation?: number }> = [];
    let clears = 0;
    const anno = {
      ghostHoverAt: (toolId: string, pon: number, point: Vec, rotation?: number) =>
        hovers.push({ toolId, pon, point, rotation }),
      clearGhost: () => {
        clears++;
      },
    } as unknown as AnnotationHostCapability;
    return { anno, hovers, clears: () => clears };
  }
  const ghostInteraction = {
    activeToolId: () => 'stamp',
  } as unknown as InteractionCapability;

  it('hover over a page routes the ACTIVE tool + rotation to the capability', () => {
    const { anno, hovers } = makeGhostAnno();
    const h = createGhostHandler(anno, ghostInteraction);
    h.onHover?.(sample({ page: { pon: PAGE_1, point: { x: 100, y: 200 }, rotation: 90 } }));
    expect(hovers).toEqual([
      { toolId: 'stamp', pon: PAGE_1, point: { x: 100, y: 200 }, rotation: 90 },
    ]);
  });

  it('hover over the page gap clears the ghost', () => {
    const { anno, hovers, clears } = makeGhostAnno();
    const h = createGhostHandler(anno, ghostInteraction);
    h.onHover?.(sample({}));
    expect(hovers).toHaveLength(0);
    expect(clears()).toBe(1);
  });

  it('a press hides the ghost and NEVER captures (real handlers still route)', () => {
    const { anno, clears } = makeGhostAnno();
    const h = createGhostHandler(anno, ghostInteraction);
    expect(h.onDown(down())).toBe(false);
    expect(clears()).toBe(1);
  });
});

describe('annotation draw handler — grouped ink', () => {
  it('restarts the grouping window and flushes the accumulated ink once', () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const anno = {
        toolSubtype: () => 'ink',
        tool: () => ({ ink: { groupStrokesMs: 800 } }),
        createPointer: (_tool: string, phase: string) => calls.push(phase),
        finishInkDraft: () => calls.push('finish'),
      } as unknown as AnnotationHostCapability;
      const inkInteraction = {
        activeToolId: () => 'ink',
        onToolChange: () => () => {},
        setCursor: () => {},
      } as unknown as InteractionCapability;
      const handler = createDrawHandler(anno, inkInteraction);
      const at = (phase: PointerSample['phase'], x: number) =>
        sample({ phase, page: { pon: PAGE_1, point: { x, y: 20 } } });

      handler.onDown(at('down', 10));
      handler.onMove?.(at('move', 30));
      handler.onUp?.(at('up', 30));
      vi.advanceTimersByTime(400);
      handler.onDown(at('down', 40));
      handler.onMove?.(at('move', 60));
      handler.onUp?.(at('up', 60));

      vi.advanceTimersByTime(799);
      expect(calls.filter((call) => call === 'finish')).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(calls.filter((call) => call === 'finish')).toHaveLength(1);
      expect(calls.filter((call) => call === 'up')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
