import { describe, expect, it } from 'vitest';
import { wheelZoomFactor } from '../src/wheel';

const px = (deltaY: number, mods: { ctrl?: boolean; meta?: boolean } = {}) => ({
  deltaY,
  deltaMode: 0,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
});

describe('wheelZoomFactor — one feel per input class', () => {
  it('trackpad pinch (synthetic ctrl+wheel): exp(-Δ/100), tracking the finger 1:1', () => {
    expect(wheelZoomFactor(px(-30, { ctrl: true }))).toBeCloseTo(Math.exp(0.3), 6);
    expect(wheelZoomFactor(px(12.5, { ctrl: true }))).toBeCloseTo(Math.exp(-0.125), 6);
    // a full pinch-out gesture (Σ −300) multiplies to ~e³ ≈ 20× — the Figma feel
    let zoom = 1;
    for (let i = 0; i < 30; i++) zoom *= wheelZoomFactor(px(-10, { ctrl: true }));
    expect(zoom).toBeCloseTo(Math.exp(3), 4);
    // symmetric: pinch out then in lands exactly home
    expect(
      wheelZoomFactor(px(-40, { ctrl: true })) * wheelZoomFactor(px(40, { ctrl: true })),
    ).toBeCloseTo(1, 9);
  });

  it('mouse notches step 1.2 — the zoom-button ratio, never the pinch mapping', () => {
    // Chrome/Edge px notches (±100/±120)
    expect(wheelZoomFactor(px(-120, { ctrl: true }))).toBeCloseTo(1.2, 6);
    expect(wheelZoomFactor(px(100, { ctrl: true }))).toBeCloseTo(1 / 1.2, 6);
    // Firefox line mode — regardless of the line count per notch
    expect(wheelZoomFactor({ deltaY: -3, deltaMode: 1, ctrlKey: true, metaKey: false }));
    expect(
      wheelZoomFactor({ deltaY: -3, deltaMode: 1, ctrlKey: true, metaKey: false }),
    ).toBeCloseTo(1.2, 6);
    expect(wheelZoomFactor({ deltaY: 1, deltaMode: 1, ctrlKey: false, metaKey: true })).toBeCloseTo(
      1 / 1.2,
      6,
    );
  });

  it('cmd + continuous scroll keeps the gentle scrub (momentum-safe)', () => {
    expect(wheelZoomFactor(px(-40, { meta: true }))).toBeCloseTo(Math.exp(0.06), 6);
    // a fast momentum event (±150 px) must NOT be misread as a notch
    expect(wheelZoomFactor(px(-150, { meta: true }))).toBeCloseTo(Math.exp(0.225), 6);
    // and a cmd+mouse notch lands within 0.3% of the button step anyway
    expect(wheelZoomFactor(px(-120, { meta: true }))).toBeCloseTo(1.2, 2);
  });
});
