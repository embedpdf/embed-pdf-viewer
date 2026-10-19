import { describe, expect, it } from 'vitest';
import { shallowEqual, toPageRef } from '@embedpdf/core';

import { stageState } from '../src/state';
import { placedStage } from './harness';

describe('stageState', () => {
  it('reads the State table through the getters', () => {
    const { stage } = placedStage(4, { responsive: [{ name: 'wide', when: { minWidth: 800 } }] });
    stage.goToPage(2, { behavior: 'instant' });
    stage.zoomTo(1.5);
    stage.rotateViewBy(90);

    expect(stageState.read(stage)).toEqual({
      zoomLevel: 1.5,
      zoomMode: 'custom',
      currentPageIndex: 2,
      currentPage: toPageRef(3),
      pageCount: 4,
      viewRotation: 90,
      activeRules: ['wide'],
    });
  });

  it('is the same, field by field, while nothing changed', () => {
    const { stage } = placedStage();
    expect(shallowEqual(stageState.read(stage), stageState.read(stage))).toBe(true);
  });

  it('has the same fields with no document', () => {
    const { stage } = placedStage();
    expect(Object.keys(stageState.empty).sort()).toEqual(
      Object.keys(stageState.read(stage)).sort(),
    );
    expect(stageState.empty.currentPage).toBeNull();
    expect(stageState.empty.pageCount).toBe(0);
  });
});
