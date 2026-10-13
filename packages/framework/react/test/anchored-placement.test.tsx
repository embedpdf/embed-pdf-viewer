// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { AnchoredFit, AnchoredPlacement } from '@embedpdf/web';

import { Anchored, ProjectorProvider, type ViewProjector } from '../src/anchored';

/**
 * `<Anchored>` says where it sits in `data-placement`: the placement asked
 * for, or the opposite side once its measured size has no room there, so
 * what opens from it can open away from the box.
 */

// Measured at once, as 80 × 40 in a 400 × 300 view: happy-dom lays nothing out.
vi.mock('@embedpdf/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@embedpdf/web')>()),
  observeAnchoredFit: (
    _element: HTMLElement,
    _space: string,
    report: (fit: AnchoredFit) => void,
  ) => {
    report({ size: { width: 80, height: 40 }, view: { x: 0, y: 0, width: 400, height: 300 } });
    return () => {};
  },
}));

const projector: ViewProjector = {
  space: 'overlay',
  toScreen: (_page, rect) => rect,
  toScreenPoint: (_page, at) => at,
  viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
  view: () => ({ x: 0, y: 0, width: 400, height: 300 }),
};

/** Where `<Anchored>` says it sits around a box at `y`, asked for `placement`. */
function placementAt(y: number, placement: AnchoredPlacement): string | null {
  const view = render(
    <ProjectorProvider value={{ projector, revision: 0 }}>
      <Anchored
        anchor={{
          page: { kind: 'objectNumber', objectNumber: 1 },
          bounds: { x: 100, y, width: 50, height: 20 },
        }}
        placement={placement}
      >
        <span className="bar">bar</span>
      </Anchored>
    </ProjectorProvider>,
  );
  const placed = view.container
    .querySelector('.bar')
    ?.parentElement?.getAttribute('data-placement');
  view.unmount();
  return placed ?? null;
}

afterEach(cleanup);

describe('Anchored', () => {
  it('says it sits where it was asked to while there is room', () => {
    expect(placementAt(150, 'top')).toBe('top');
    expect(placementAt(150, 'bottom-end')).toBe('bottom-end');
  });

  it('says it sits on the other side once it flipped there', () => {
    // 20 px above the box: no room for 40 px and the gaps.
    expect(placementAt(20, 'top')).toBe('bottom');
    expect(placementAt(20, 'top-start')).toBe('bottom-start');
    // 30 px below it.
    expect(placementAt(250, 'bottom')).toBe('top');
  });
});
