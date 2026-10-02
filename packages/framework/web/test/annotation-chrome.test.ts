import { describe, expect, it } from 'vitest';

import {
  annotationChromePaint,
  chromeInPixels,
  type ChromePaintSettings,
} from '../src/annotation-chrome';

const chrome: ChromePaintSettings = {
  accent: null,
  outline: { color: null, style: 'dashed', width: 1 },
  handles: { fill: '#fff', stroke: null },
  rotationHandle: { fill: null, stroke: null },
  guides: { color: '#f0f', rotationColor: null, style: 'solid', width: 1 },
  marquee: { fill: null, stroke: null },
  textOutline: null,
};

describe('annotationChromePaint', () => {
  it('paints every unset color with the accent, each behind its own variable', () => {
    const painted = annotationChromePaint(chrome, '#123456');
    expect(painted.outline.stroke).toBe(
      'var(--epdf-annotation-outline, var(--epdf-annotation-accent, var(--epdf-accent, #123456)))',
    );
    expect(painted.outline.strokeDasharray).toBe('var(--epdf-annotation-outline-dash, 4 3)');
    expect(painted.handle.fill).toBe('var(--epdf-annotation-handle-fill, #fff)');
    expect(painted.guide.stroke).toBe('var(--epdf-annotation-guide, #f0f)');
    expect(painted.marquee.fill).toContain('color-mix(in srgb');
    expect(painted.textOutline).toContain('#123456');
  });

  it('prefers the chrome accent to the viewer’s, and the handles to the accent', () => {
    const painted = annotationChromePaint(
      { ...chrome, accent: '#00ff00', handles: { fill: '#eee', stroke: '#111' } },
      '#123456',
    );
    expect(painted.outline.stroke).toContain('#00ff00');
    expect(painted.outline.stroke).not.toContain('#123456');
    // The rotation handle looks like the handles until it has its own colors.
    expect(painted.rotationHandle.fill).toContain('#eee');
    expect(painted.rotationHandle.stroke).toContain('#111');
  });
});

describe('chromeInPixels', () => {
  const page = {
    toPixels: (point: { x: number; y: number }) => ({ x: point.x * 2, y: point.y * 2 }),
  };

  it('places every node in the page layer’s pixels', () => {
    const drawn = chromeInPixels(
      [
        { kind: 'outline', rect: { x: 1, y: 1, width: 2, height: 3 } },
        { kind: 'marquee', rect: { x: 0, y: 0, width: 1, height: 1 } },
        {
          kind: 'obb',
          corners: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
        },
        { kind: 'handle', at: { x: 1, y: 1 }, rot: 30, role: 'corner', active: true },
        { kind: 'handle', at: { x: 2, y: 2 }, role: 'side', active: false },
        { kind: 'rotate-knob', at: { x: 1, y: -1 }, from: { x: 1, y: 0 } },
      ],
      page,
    );
    expect(drawn).toEqual([
      { kind: 'outline', box: { left: 2, top: 2, width: 4, height: 6 } },
      { kind: 'marquee', box: { left: 0, top: 0, width: 2, height: 2 } },
      { kind: 'turned-outline', points: '0,0 2,0 2,2 0,2' },
      { kind: 'handle', at: { x: 2, y: 2 }, rotation: 30, role: 'corner', active: true },
      { kind: 'handle', at: { x: 4, y: 4 }, rotation: 0, role: 'side', active: false },
      { kind: 'rotation-handle', at: { x: 2, y: -2 }, from: { x: 2, y: 0 } },
    ]);
  });

  it('runs a guide along its axis, and fades the reference cross of a turn', () => {
    const [vertical, horizontal, guides] = chromeInPixels(
      [
        { kind: 'guide', axis: 'x', at: 5, lo: 1, hi: 9 },
        { kind: 'guide', axis: 'y', at: 5, lo: 1, hi: 9 },
        {
          kind: 'rotate-guides',
          lines: [
            { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, role: 'axis' },
            { a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, role: 'indicator' },
          ],
        },
      ],
      page,
    );
    expect(vertical).toEqual({ kind: 'guide', from: { x: 10, y: 2 }, to: { x: 10, y: 18 } });
    expect(horizontal).toEqual({ kind: 'guide', from: { x: 2, y: 10 }, to: { x: 18, y: 10 } });
    expect(guides).toEqual({
      kind: 'rotation-guides',
      lines: [
        { from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, opacity: 0.35 },
        { from: { x: 0, y: 0 }, to: { x: 2, y: 2 }, opacity: 0.8 },
      ],
    });
  });
});
