import { describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/core';

import { placedStage } from '../harness';

describe('page reads', () => {
  it('name the current page by its ref, and count the pages', () => {
    const { stage } = placedStage(5);
    expect(stage.getCurrentPage()).toEqual(toPageRef(1));
    stage.goToPage(3, { behavior: 'instant' });
    expect(stage.getCurrentPage()).toEqual(toPageRef(4));
    expect(stage.getCurrentPageIndex()).toBe(3);
    expect(stage.getPageCount()).toBe(5);
  });

  it('announce the new current page by its ref', () => {
    const { stage } = placedStage(5);
    const pages: unknown[] = [];
    stage.onPageChanged((event) => pages.push(event.page));
    stage.goToPage(2, { behavior: 'instant' });
    expect(pages).toEqual([toPageRef(3)]);
  });

  it('take a page as its ref or its index', () => {
    const { stage } = placedStage(5);
    const ref = toPageRef(1);
    const boxOf = (page: number | typeof ref) => {
      const frame = stage.getPageFrame(page)!;
      return { ref: frame.ref, x: frame.x, y: frame.y, screenX: frame.screenX, width: frame.width };
    };
    expect(boxOf(0)).toEqual(boxOf(ref));
    expect(stage.isPageVisible(0)).toBe(true);
    expect(stage.isPageVisible(4)).toBe(stage.isPageVisible(toPageRef(5)));
    const point = { x: 10, y: 20 };
    expect(stage.pageToViewport(0, point)).toEqual(stage.pageToViewport(ref, point));
    const rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(stage.pageRectToViewport(0, rect)).toEqual(stage.pageRectToViewport(ref, rect));
    const onScreen = stage.pageToViewport(0, point)!;
    expect(stage.viewportToPage(0, onScreen)!.x).toBeCloseTo(point.x);
    expect(stage.viewportToPage(0, onScreen)!.y).toBeCloseTo(point.y);
  });

  it('answer empty for a page that isn’t in the document', () => {
    const { stage } = placedStage(5);
    expect(stage.getPageFrame(9)).toBeNull();
    expect(stage.getPageFrame(toPageRef(99))).toBeNull();
    expect(stage.isPageVisible(9)).toBe(false);
    expect(stage.viewportToPage(9, { x: 0, y: 0 })).toBeNull();
    expect(stage.pageToViewport(toPageRef(99), { x: 0, y: 0 })).toBeNull();
  });
});
