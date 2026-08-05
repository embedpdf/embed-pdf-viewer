import { describe, expect, it } from 'vitest';
import { positionMenuAroundRect } from '../src/internal/annotation-menu-position';

/**
 * Pure placement math (no DOM): the menu stays centred on `box` and nudges ONLY
 * the edge it sits on, and only when the knob actually protrudes past that edge.
 * Everything is in screen px; page rotation is already baked into the inputs by
 * the callers' transforms.
 */
describe('positionMenuAroundRect — knob nudges only the placement edge', () => {
  // A 100×40 box at (100, 100): centre (150, 120).
  const box = { x: 100, y: 100, width: 100, height: 40 };
  const gap = 8;

  describe("placement 'top'", () => {
    const noKnob = positionMenuAroundRect(box, 'top', gap);

    it('a knob ABOVE the box raises top and keeps left == centre x', () => {
      const knob = { x: 150, y: 70 }; // above box.y (100)
      const p = positionMenuAroundRect(box, 'top', gap, knob);
      expect(p.left).toBe(150);
      expect(p.top).toBe(70 - gap); // edge follows the protruding knob
      expect(p.transform).toBe('translate(-50%, -100%)');
    });

    it('a knob at the SIDE (within the box vertically) leaves top + left unchanged', () => {
      const knob = { x: 60, y: 120 }; // y inside the box → does not protrude up
      const p = positionMenuAroundRect(box, 'top', gap, knob);
      expect(p.left).toBe(noKnob.left);
      expect(p.top).toBe(noKnob.top);
    });
  });

  describe("placement 'bottom'", () => {
    const noKnob = positionMenuAroundRect(box, 'bottom', gap);

    it('a knob BELOW the box lowers top and keeps left == centre x', () => {
      const knob = { x: 150, y: 170 }; // below box.y + height (140)
      const p = positionMenuAroundRect(box, 'bottom', gap, knob);
      expect(p.left).toBe(150);
      expect(p.top).toBe(170 + gap);
    });

    it('a knob at the SIDE leaves the bottom edge unchanged', () => {
      const knob = { x: 60, y: 120 };
      const p = positionMenuAroundRect(box, 'bottom', gap, knob);
      expect(p.left).toBe(noKnob.left);
      expect(p.top).toBe(noKnob.top);
    });
  });

  describe("placement 'left'", () => {
    const noKnob = positionMenuAroundRect(box, 'left', gap);

    it('a knob to the LEFT pushes left and keeps top == centre y', () => {
      const knob = { x: 70, y: 120 }; // left of box.x (100)
      const p = positionMenuAroundRect(box, 'left', gap, knob);
      expect(p.left).toBe(70 - gap);
      expect(p.top).toBe(120);
    });

    it('a knob ABOVE/BELOW (within the box horizontally) leaves left unchanged', () => {
      const knob = { x: 150, y: 70 };
      const p = positionMenuAroundRect(box, 'left', gap, knob);
      expect(p.left).toBe(noKnob.left);
      expect(p.top).toBe(noKnob.top);
    });
  });

  describe("placement 'right'", () => {
    const noKnob = positionMenuAroundRect(box, 'right', gap);

    it('a knob to the RIGHT pushes right and keeps top == centre y', () => {
      const knob = { x: 230, y: 120 }; // right of box.x + width (200)
      const p = positionMenuAroundRect(box, 'right', gap, knob);
      expect(p.left).toBe(230 + gap);
      expect(p.top).toBe(120);
    });

    it('a knob ABOVE/BELOW leaves the right edge unchanged', () => {
      const knob = { x: 150, y: 70 };
      const p = positionMenuAroundRect(box, 'right', gap, knob);
      expect(p.left).toBe(noKnob.left);
      expect(p.top).toBe(noKnob.top);
    });
  });

  it('no knob behaves exactly as before (centred on the box)', () => {
    expect(positionMenuAroundRect(box, 'top', gap)).toEqual({
      left: 150,
      top: 100 - gap,
      transform: 'translate(-50%, -100%)',
    });
  });
});
