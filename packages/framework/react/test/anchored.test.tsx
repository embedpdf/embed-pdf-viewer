// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  Anchored,
  ProjectorProvider,
  ShownPagesProvider,
  type ShownPages,
  type ViewProjector,
} from '../src/anchored';

/**
 * `<Anchored>` on a page that isn't shown renders nothing and sits out every
 * camera frame; on a shown page it follows the camera, and shows nothing once
 * its box is out of view.
 */

const pageOf = (objectNumber: number) => ({ kind: 'objectNumber' as const, objectNumber });

/** A 400 × 300 surface that shows pages where their rects say, one frame at a time. */
const projector: ViewProjector = {
  space: 'overlay',
  toScreen: (_page, rect) => rect,
  toScreenPoint: (_page, at) => at,
  viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
  view: () => ({ x: 0, y: 0, width: 400, height: 300 }),
};

function Surface({
  frame,
  shown,
  children,
}: {
  frame: number;
  shown: ShownPages;
  children: React.ReactNode;
}) {
  // A new binding each frame, as the Stage's camera gives one.
  const binding = React.useMemo(() => ({ projector, revision: frame }), [frame]);
  return (
    <ShownPagesProvider value={shown}>
      <ProjectorProvider value={binding}>{children}</ProjectorProvider>
    </ShownPagesProvider>
  );
}

/** Renders `<Anchored>` through three camera frames and counts its renders. */
function throughFrames(anchor: React.ComponentProps<typeof Anchored>['anchor']) {
  const shown: ShownPages = new Set([1]);
  let renders = 0;
  const content = (
    <React.Profiler id="anchored" onRender={() => renders++}>
      <Anchored anchor={anchor} pinned>
        <span className="badge">✓</span>
      </Anchored>
    </React.Profiler>
  );
  const view = render(
    <Surface frame={0} shown={shown}>
      {content}
    </Surface>,
  );
  for (const frame of [1, 2, 3]) {
    view.rerender(
      <Surface frame={frame} shown={shown}>
        {content}
      </Surface>,
    );
  }
  return { renders, badge: document.querySelector('.badge') };
}

afterEach(cleanup);

describe('Anchored', () => {
  it('on a page that isn’t shown renders nothing, and sits out the camera frames', () => {
    const { renders, badge } = throughFrames({
      page: pageOf(2),
      bounds: { x: 100, y: 100, width: 50, height: 20 },
    });
    expect(badge).toBeNull();
    expect(renders).toBe(1); // mounted once, never again
  });

  it('on a shown page follows the camera', () => {
    const { renders, badge } = throughFrames({
      page: pageOf(1),
      bounds: { x: 100, y: 100, width: 50, height: 20 },
    });
    expect(badge).not.toBeNull();
    expect(renders).toBeGreaterThan(1);
  });

  it('on a shown page shows nothing while its box is out of view', () => {
    const { badge } = throughFrames({
      page: pageOf(1),
      bounds: { x: 100, y: 900, width: 50, height: 20 },
    });
    expect(badge).toBeNull();
  });
});
