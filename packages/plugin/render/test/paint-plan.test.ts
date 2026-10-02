import { describe, expect, it } from 'vitest';

import { samePageViewDemand } from '../src/contract';

describe('samePageViewDemand', () => {
  const visibleRect = { x: 0, y: 10, width: 100, height: 50 };

  it('is the same demand when every number is, whatever the objects', () => {
    expect(
      samePageViewDemand(
        { desiredDeviceWidth: 640, visibleRect, velocity: { dx: 1, dy: 0 } },
        { desiredDeviceWidth: 640, visibleRect: { ...visibleRect }, velocity: { dx: 1, dy: 0 } },
      ),
    ).toBe(true);
    expect(samePageViewDemand({ desiredDeviceWidth: 640 }, { desiredDeviceWidth: 640 })).toBe(true);
  });

  it('differs in the width, the visible part or the velocity', () => {
    const demand = { desiredDeviceWidth: 640, visibleRect };
    expect(samePageViewDemand(demand, { ...demand, desiredDeviceWidth: 641 })).toBe(false);
    expect(samePageViewDemand(demand, { ...demand, visibleRect: { ...visibleRect, y: 11 } })).toBe(
      false,
    );
    expect(samePageViewDemand(demand, { desiredDeviceWidth: 640 })).toBe(false);
    expect(samePageViewDemand(demand, { ...demand, velocity: { dx: 0, dy: 1 } })).toBe(false);
  });
});
