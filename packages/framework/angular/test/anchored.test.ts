/**
 * `<epdf-anchored>` on a page that isn't shown renders nothing and sits out every camera
 * frame; on a shown page it follows the camera, and shows nothing once its box is out of view.
 */
import { Component, computed, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EPDF_PROJECTOR,
  EpdfAnchored,
  type EpdfAnchor,
  type EpdfProjectorBinding,
  type ViewProjector,
} from '@embedpdf/angular/anchored';

const pageOf = (objectNumber: number) => ({ kind: 'objectNumber' as const, objectNumber });

/** A 400 × 300 surface that shows page 1, placing boxes where their rects say. */
let projections = 0;
const projector: ViewProjector = {
  space: 'overlay',
  toScreen: (_page, rect) => (projections++, rect),
  toScreenPoint: (_page, at) => at,
  viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
  view: () => ({ x: 0, y: 0, width: 400, height: 300 }),
};
const frame = signal(0);
const binding: EpdfProjectorBinding = {
  projector: signal(projector),
  // A new revision each camera frame, as the Stage's visible pages give one.
  revision: computed(() => frame()),
  shownPages: signal(new Set([1])),
};

@Component({
  selector: 'test-badge',
  imports: [EpdfAnchored],
  providers: [{ provide: EPDF_PROJECTOR, useValue: binding }],
  template: `
    <epdf-anchored [anchor]="anchor()" placement="bottom" pinned>
      <span class="badge">✓</span>
    </epdf-anchored>
  `,
})
class Badge {
  readonly anchor = input<EpdfAnchor | null>(null);
}

/** Mount a badge, then move the camera three frames; how many times did it project? */
async function throughFrames(anchor: EpdfAnchor) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Badge);
  fixture.componentRef.setInput('anchor', anchor);
  await fixture.whenStable();
  projections = 0;
  for (const next of [1, 2, 3]) {
    frame.set(next);
    await fixture.whenStable();
  }
  return {
    projections,
    badge: fixture.nativeElement.querySelector('.badge') as HTMLElement | null,
  };
}

afterEach(() => TestBed.resetTestingModule());

describe('<epdf-anchored>', () => {
  it('on a page that isn’t shown renders nothing, and sits out the camera frames', async () => {
    const { projections, badge } = await throughFrames({
      page: pageOf(2),
      bounds: { x: 100, y: 100, width: 50, height: 20 },
    });
    expect(badge).toBeNull();
    expect(projections).toBe(0);
  });

  it('on a shown page follows the camera', async () => {
    const { projections, badge } = await throughFrames({
      page: pageOf(1),
      bounds: { x: 100, y: 100, width: 50, height: 20 },
    });
    expect(badge).not.toBeNull();
    expect(projections).toBeGreaterThanOrEqual(3);
    // Pinned under the box: its top edge 8 pixels below the box's bottom.
    expect((badge!.parentElement as HTMLElement).style.top).toBe('128px');
  });

  it('on a shown page shows nothing while its box is out of view', async () => {
    const { badge } = await throughFrames({
      page: pageOf(1),
      bounds: { x: 100, y: 900, width: 50, height: 20 },
    });
    expect(badge).toBeNull();
  });
});
