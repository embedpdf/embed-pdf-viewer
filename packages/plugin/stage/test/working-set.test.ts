/**
 * Every lens tells the engine what it shows (`doc.setWorkingSet`): its pages
 * on screen with the part that shows and its device pixels, and the pages laid
 * out just off screen as near. Only when that changes.
 */
import { describe, expect, it } from 'vitest';
import { toPageRef, type WorkingSetPage } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';

import { createStageController } from '../src/controller';
import type { StageHostCapability } from '../src/host-contract';
import { initialStageState } from '../src/model';

function lens(id: string) {
  const told: Array<{ view: string; pages: WorkingSetPage[] }> = [];
  const ctx = createTestContext({
    id,
    state: initialStageState({ viewUnitsPerPoint: 1 }),
    pages: Array.from({ length: 6 }, (_, index) => ({
      ref: toPageRef(index + 1),
      size: { width: 600, height: 800 },
    })),
    doc: {
      setWorkingSet: (view: string, pages: readonly WorkingSetPage[]) =>
        void told.push({ view, pages: [...pages] }),
    },
  });
  const stage: StageHostCapability = ctx.connect(createStageController(ctx));
  return { stage, told };
}

describe('the working set a lens tells the engine', () => {
  it('names the pages on screen with their part and pixels, and those laid out off screen as near', () => {
    const { stage, told } = lens('stage');
    expect(told).toEqual([]); // nothing laid out yet: nothing to say
    stage.setViewportSize({ width: 1000, height: 700 });

    expect(told).toHaveLength(1);
    const { view, pages } = told[0]!;
    expect(view).toBe('stage');
    const laidOut = stage.listVisiblePages();
    expect(pages.map((entry) => entry.page)).toEqual(laidOut.map((page) => page.ref));
    for (const [index, entry] of pages.entries()) {
      const { visibleRect, transform } = laidOut[index]!;
      if (visibleRect.width > 0 && visibleRect.height > 0) {
        expect(entry).toEqual({
          page: laidOut[index]!.ref,
          role: 'visible',
          visible: visibleRect,
          pixels: Math.round(visibleRect.width * visibleRect.height * transform.renderScale ** 2),
        });
      } else {
        expect(entry).toEqual({ page: laidOut[index]!.ref, role: 'near', pixels: 0 });
      }
    }
    expect(pages.filter((entry) => entry.role === 'visible').length).toBeGreaterThan(0);
    expect(pages.filter((entry) => entry.role === 'near').length).toBeGreaterThan(0);
  });

  it('tells again when what shows changes, and not when it stays the same', () => {
    const { stage, told } = lens('stage-thumbs');
    stage.setViewportSize({ width: 1000, height: 700 });
    const first = told.at(-1)!.pages;
    stage.setViewportSize({ width: 1000, height: 700 });
    expect(told).toHaveLength(1);

    stage.panBy(0, -300); // drags the pages up: further down the document
    expect(told).toHaveLength(2);
    expect(told[1]!.view).toBe('stage-thumbs');
    expect(told[1]!.pages).not.toEqual(first);
  });
});
