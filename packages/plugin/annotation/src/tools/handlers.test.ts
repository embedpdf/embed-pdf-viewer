/**
 * The edit handler's page anchoring: a gesture belongs to the page it started
 * on. Moves resolve through the source's projection onto THAT page (so the
 * annotation keeps tracking — sliding along the edge — when the cursor leaves
 * it), foreign-page samples are ignored, and `up` ALWAYS closes the gesture
 * (a release over the page gap used to strand the move draft, so the
 * annotation snapped back on the next interaction).
 */
import type { Vec } from '@embedpdf/core-annotation';
import { pageRefsEqual, toPageRef, type PageRef } from '@embedpdf/engine-core/runtime';
import type {
  InteractionHostCapability,
  PointerSample,
} from '@embedpdf/plugin-interaction/contract/host';
import { describe, expect, it, vi } from 'vitest';

import { createDrawHandler, createEditHandler, createGhostHandler } from './handlers';
import type { AnnotationHostCapability } from '../host-contract';

const PAGE_1 = toPageRef(1);
const PAGE_2 = toPageRef(2);

type Call = { phase: string; page: PageRef; point: Vec };

function makeAnno(hit: 'annot' | 'empty' = 'annot') {
  const calls: Call[] = [];
  const anno = {
    getEditingId: () => null,
    endTextEdit: () => {},
    getHitKind: () => hit,
    clearSelection: () => {},
    beginTextEditAt: () => {},
    getCursorAt: () => null,
    editPointer: (phase: string, page: PageRef, point: Vec) => calls.push({ phase, page, point }),
  } as unknown as AnnotationHostCapability;
  return { anno, calls };
}

const interaction = { claimCursor: () => {} } as unknown as InteractionHostCapability;

const sample = (over: Partial<PointerSample>): PointerSample => ({
  phase: 'move',
  viewport: { x: 0, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
  ...over,
});

const down = () => sample({ phase: 'down', page: { ref: PAGE_1, point: { x: 300, y: 730 } } });

describe('annotation edit handler — page anchoring', () => {
  it('tracks the ORIGIN page through the projection, not the page under the cursor', () => {
    const { anno, calls } = makeAnno();
    const h = createEditHandler(anno, interaction);
    expect(h.onDown(down())).toBe(true);
    // The cursor is physically over page 2 (its local y ≈ 18); the projection
    // onto page 1 says y = 810 (past its bottom edge — unclamped, as expected).
    h.onMove?.(
      sample({
        page: { ref: PAGE_2, point: { x: 300, y: 18 } },
        project: (page) => (pageRefsEqual(page, PAGE_1) ? { x: 300, y: 810 } : null),
      }),
    );
    expect(calls.at(-1)).toEqual({ phase: 'move', page: PAGE_1, point: { x: 300, y: 810 } });
  });

  it('ignores a sample that cannot speak for the origin page (foreign per-page source)', () => {
    const { anno, calls } = makeAnno();
    const h = createEditHandler(anno, interaction);
    h.onDown(down());
    const before = calls.length;
    h.onMove?.(sample({ page: { ref: PAGE_2, point: { x: 300, y: 18 } }, project: () => null }));
    expect(calls.length).toBe(before);
  });

  it('ALWAYS dispatches up — release over the page gap must still commit', () => {
    const { anno, calls } = makeAnno();
    const h = createEditHandler(anno, interaction);
    h.onDown(down());
    h.onMove?.(
      sample({ project: (page) => (pageRefsEqual(page, PAGE_1) ? { x: 300, y: 780 } : null) }),
    );
    // Over the gap: no page hit, and (worst case) no projection either.
    h.onUp?.(sample({ phase: 'up' }));
    expect(calls.at(-1)).toEqual({ phase: 'up', page: PAGE_1, point: { x: 300, y: 780 } });
  });

  it('a gesture that never armed (empty hit) routes nothing on move/up', () => {
    const { anno, calls } = makeAnno('empty');
    const h = createEditHandler(anno, interaction);
    expect(h.onDown(down())).toBe(false);
    h.onMove?.(sample({ page: { ref: PAGE_1, point: { x: 10, y: 10 } } }));
    h.onUp?.(sample({ phase: 'up', page: { ref: PAGE_1, point: { x: 10, y: 10 } } }));
    expect(calls.length).toBe(0);
  });
});

describe('annotation ghost handler — hover footprint', () => {
  function makeGhostAnno() {
    const hovers: Array<{ toolId: string; page: PageRef; point: Vec; rotation?: number }> = [];
    let clears = 0;
    const anno = {
      hoverGhostAt: (toolId: string, page: PageRef, point: Vec, rotation?: number) =>
        hovers.push({ toolId, page, point, rotation }),
      clearGhost: () => {
        clears++;
      },
    } as unknown as AnnotationHostCapability;
    return { anno, hovers, clears: () => clears };
  }
  const ghostInteraction = {
    getActiveToolId: () => 'stamp',
  } as unknown as InteractionHostCapability;

  it('hover over a page routes the ACTIVE tool + rotation to the capability', () => {
    const { anno, hovers } = makeGhostAnno();
    const h = createGhostHandler(anno, ghostInteraction);
    h.onHover?.(sample({ page: { ref: PAGE_1, point: { x: 100, y: 200 }, rotation: 90 } }));
    expect(hovers).toEqual([
      { toolId: 'stamp', page: PAGE_1, point: { x: 100, y: 200 }, rotation: 90 },
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
        getToolSubtype: () => 'ink',
        getResolvedTool: () => ({ ink: { groupStrokesMs: 800 } }),
        createPointer: (_tool: string, phase: string) => calls.push(phase),
        finishInkDraft: () => calls.push('finish'),
      } as unknown as AnnotationHostCapability;
      const inkInteraction = {
        getActiveToolId: () => 'ink',
        onToolChanged: () => () => {},
        claimCursor: () => {},
      } as unknown as InteractionHostCapability;
      const handler = createDrawHandler(anno, inkInteraction);
      const at = (phase: PointerSample['phase'], x: number) =>
        sample({ phase, page: { ref: PAGE_1, point: { x, y: 20 } } });

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

describe('annotation edit handler — touch consent + cancel', () => {
  it('claimsTouch delegates to the capability predicate, page-gated', () => {
    const asked: Array<{ page: PageRef; point: Vec }> = [];
    const anno = {
      claimsTouchAt: (page: PageRef, point: Vec) => {
        asked.push({ page, point });
        return true;
      },
    } as unknown as AnnotationHostCapability;
    const h = createEditHandler(anno, interaction);
    expect(h.claimsTouch?.(sample({ phase: 'down' }))).toBe(false); // no page → never
    expect(asked.length).toBe(0);
    expect(
      h.claimsTouch?.(sample({ phase: 'down', page: { ref: PAGE_1, point: { x: 5, y: 6 } } })),
    ).toBe(true);
    expect(asked).toEqual([{ page: PAGE_1, point: { x: 5, y: 6 } }]);
  });

  it('onCancel REVERTS to the down point and closes there (no half-moved commit)', () => {
    const { anno, calls } = makeAnno();
    const h = createEditHandler(anno, interaction);
    h.onDown(down()); // down at (300, 730)
    h.onMove?.(sample({ page: { ref: PAGE_1, point: { x: 350, y: 780 } } }));
    h.onCancel?.(sample({ phase: 'cancel' }));
    // the replay: move back to the origin, then up at the origin
    expect(calls.slice(-2)).toEqual([
      { phase: 'move', page: PAGE_1, point: { x: 300, y: 730 } },
      { phase: 'up', page: PAGE_1, point: { x: 300, y: 730 } },
    ]);
    // and the gesture is CLOSED: further moves route nothing
    const n = calls.length;
    h.onMove?.(sample({ page: { ref: PAGE_1, point: { x: 1, y: 1 } } }));
    expect(calls.length).toBe(n);
  });
});

describe('annotation draw handler — cancel discards the draft', () => {
  function makeDrawAnno() {
    const calls: Array<{ fn: string; args: unknown[] }> = [];
    const anno = {
      getToolSubtype: () => 'square',
      getResolvedTool: () => undefined,
      createPointer: (...args: unknown[]) => calls.push({ fn: 'createPointer', args }),
      cancelCreationDraft: () => calls.push({ fn: 'cancelCreationDraft', args: [] }),
      finishInkDraft: () => calls.push({ fn: 'finishInkDraft', args: [] }),
    } as unknown as AnnotationHostCapability;
    return { anno, calls };
  }
  const drawInteraction = {
    getActiveToolId: () => 'square',
    onToolChanged: () => () => {},
  } as unknown as InteractionHostCapability;

  it('onCancel drops the draft — no up, no commit at the cancelling finger', () => {
    const { anno, calls } = makeDrawAnno();
    const h = createDrawHandler(anno, drawInteraction);
    expect(h.onDown(down())).toBe(true);
    h.onMove?.(sample({ page: { ref: PAGE_1, point: { x: 350, y: 780 } } }));
    // the cancel sample carries the SECOND finger's position — it must never
    // become the shape's final point
    h.onCancel?.(sample({ phase: 'cancel', page: { ref: PAGE_1, point: { x: 40, y: 40 } } }));
    expect(calls.at(-1)?.fn).toBe('cancelCreationDraft');
    expect(calls.filter((c) => c.fn === 'createPointer' && c.args[1] === 'up')).toHaveLength(0);
    // gesture is closed: further moves route nothing
    const n = calls.length;
    h.onMove?.(sample({ page: { ref: PAGE_1, point: { x: 1, y: 1 } } }));
    expect(calls.length).toBe(n);
  });
});

describe('annotation edit handler — double-click / long-press routing', () => {
  function makeEditAnno(freeText: boolean) {
    const calls: string[] = [];
    const anno = {
      getEditingId: () => null,
      endTextEdit: () => {},
      getHitKind: () => 'annot',
      clearSelection: () => {},
      beginTextEditAt: () => {
        calls.push('beginTextEditAt');
        return freeText;
      },
      getCursorAt: () => null,
      editPointer: (phase: string) => calls.push(`edit:${phase}`),
    } as unknown as AnnotationHostCapability;
    return { anno, calls };
  }

  it('over a FREE-TEXT box: enters text edit, no move armed', () => {
    const { anno, calls } = makeEditAnno(true);
    const h = createEditHandler(anno, interaction);
    expect(
      h.onDown(
        sample({ phase: 'down', clickCount: 2, page: { ref: PAGE_1, point: { x: 1, y: 2 } } }),
      ),
    ).toBe(true);
    expect(calls).toEqual(['beginTextEditAt']);
  });

  it('over any OTHER annotation: falls through to a normal press (select/move), not a swallowed no-op', () => {
    const { anno, calls } = makeEditAnno(false);
    const h = createEditHandler(anno, interaction);
    expect(
      h.onDown(
        sample({ phase: 'down', clickCount: 2, page: { ref: PAGE_1, point: { x: 1, y: 2 } } }),
      ),
    ).toBe(true);
    expect(calls).toEqual(['beginTextEditAt', 'edit:down']); // the press proceeded
  });
});

describe('distance placement — release, hover, click', () => {
  it('keeps the origin page after release and commits once, including over a page gap', () => {
    const calls: Call[] = [];
    let placementPage: PageRef | null = null;
    const anno = {
      getToolSubtype: () => 'line',
      getResolvedTool: () => undefined,
      distanceCreationPage: () => placementPage,
      createPointer: (_tool: string, phase: string, page: PageRef, point: Vec) => {
        calls.push({ phase, page, point });
        if (phase === 'up') placementPage = page;
        else if (phase === 'down' && placementPage !== null) placementPage = null;
      },
    } as unknown as AnnotationHostCapability;
    const drawInteraction = {
      getActiveToolId: () => 'distance',
      onToolChanged: () => () => {},
    } as unknown as InteractionHostCapability;
    const handler = createDrawHandler(anno, drawInteraction);

    handler.onDown(down());
    handler.onUp?.(sample({ phase: 'up', page: { ref: PAGE_1, point: { x: 400, y: 730 } } }));
    handler.onHover?.(
      sample({
        page: { ref: PAGE_2, point: { x: 400, y: 20 } },
        project: (page) => (pageRefsEqual(page, PAGE_1) ? { x: 400, y: 820 } : null),
      }),
    );
    expect(calls.at(-1)).toEqual({ phase: 'move', page: PAGE_1, point: { x: 400, y: 820 } });

    handler.onDown(sample({ phase: 'down', project: () => ({ x: 400, y: 800 }) }));
    expect(calls.at(-1)).toEqual({ phase: 'down', page: PAGE_1, point: { x: 400, y: 800 } });
    const committedCalls = calls.length;
    handler.onUp?.(sample({ phase: 'up' }));
    expect(calls).toHaveLength(committedCalls);
  });

  it('lets the placement click pass through the edit handler over an existing annotation', () => {
    const { anno, calls } = makeAnno();
    anno.distanceCreationPage = () => PAGE_1;
    const handler = createEditHandler(anno, interaction);
    expect(handler.onDown(down())).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
