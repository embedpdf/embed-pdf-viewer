import { describe, expect, it } from 'vitest';

import { ghostOpacity, sceneViewBox, svgShapesOf } from '../src/annotation-scene';

const options = { miterLimit: 10 };

describe('svgShapesOf', () => {
  it('paints with sharp miters at the core limit, and leaves out what the paint leaves unset', () => {
    const [shape] = svgShapesOf(
      [
        {
          kind: 'rect',
          rect: { x: 1, y: 2, width: 3, height: 4 },
          paint: { stroke: '#f00', width: 2 },
        },
      ],
      options,
    );
    expect(shape).toEqual({
      tag: 'rect',
      attributes: {
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        fill: 'none',
        stroke: '#f00',
        'stroke-linejoin': 'miter',
        'stroke-miterlimit': 10,
        'stroke-width': 2,
      },
    });
  });

  it('carries every paint field under its SVG name, and the blend mode apart', () => {
    const [shape] = svgShapesOf(
      [
        {
          kind: 'path',
          d: 'M0 0L1 1',
          paint: {
            fill: '#00f',
            fillRule: 'evenodd',
            opacity: 0.5,
            dash: [3, 2],
            lineCap: 'round',
            join: 'round',
            blend: 'multiply',
          },
        },
      ],
      options,
    );
    expect(shape.attributes).toMatchObject({
      d: 'M0 0L1 1',
      fill: '#00f',
      'fill-rule': 'evenodd',
      opacity: 0.5,
      'stroke-dasharray': '3 2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    expect(shape.blend).toBe('multiply');
  });

  it('draws an ellipse from its box, a line, open and closed polylines, and turned text', () => {
    const shapes = svgShapesOf(
      [
        { kind: 'ellipse', rect: { x: 0, y: 0, width: 4, height: 2 }, paint: {} },
        { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 2 }, paint: {} },
        {
          kind: 'poly',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          closed: false,
          paint: {},
        },
        {
          kind: 'poly',
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          closed: true,
          paint: {},
        },
        {
          kind: 'text',
          at: { x: 5, y: 6 },
          text: 'REDACTED',
          fontSize: 12,
          fontFamily: 'Helvetica',
          rotation: 90,
          paint: { fill: '#000' },
        },
      ],
      options,
    );
    expect(shapes.map((shape) => shape.tag)).toEqual([
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'text',
    ]);
    expect(shapes[0].attributes).toMatchObject({ cx: 2, cy: 1, rx: 2, ry: 1 });
    expect(shapes[1].attributes).toMatchObject({ x1: 0, y1: 0, x2: 1, y2: 2 });
    expect(shapes[2].attributes.points).toBe('0,0 1,1');
    expect(shapes[4]).toMatchObject({
      text: 'REDACTED',
      attributes: {
        x: 5,
        y: 6,
        transform: 'rotate(90 5 6)',
        'font-size': 12,
        'font-family': 'Helvetica',
      },
    });
  });
});

describe('sceneViewBox', () => {
  it('is the box in page points, and null while the box has no area', () => {
    expect(sceneViewBox({ x: 1, y: 2, width: 3, height: 4 })).toBe('1 2 3 4');
    expect(sceneViewBox({ x: 1, y: 2, width: 0, height: 4 })).toBeNull();
  });
});

describe('ghostOpacity', () => {
  it('lets the CSS variable win over the tool’s opacity', () => {
    expect(ghostOpacity(0.5)).toBe('var(--epdf-ghost-opacity, 0.5)');
  });
});
