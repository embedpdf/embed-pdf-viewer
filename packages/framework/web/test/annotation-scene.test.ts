import { describe, expect, it } from 'vitest';

import {
  fontProgramsOf,
  ghostOpacity,
  sceneViewBox,
  styleText,
  svgShapesOf,
} from '../src/annotation-scene';

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
    expect(shape.style).toEqual({ 'mix-blend-mode': 'multiply' });
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

  it('draws a run as one text element at its left edge, and clips a node to its box', () => {
    const program = {
      family: 'epdf-0123456789abcdef',
      weight: 700,
      style: 'italic' as const,
      load: async () => new Uint8Array(),
    };
    const [clipped] = svgShapesOf(
      [
        {
          kind: 'textRun',
          at: { x: 10, y: 20 },
          text: ' Hi ',
          rtl: false,
          plain: true,
          fontSize: 10,
          fontFamily: '"epdf-0123456789abcdef", Helvetica, Arial, sans-serif',
          fontWeight: 700,
          fontStyle: 'italic',
          rotation: 90,
          program,
          paint: { fill: '#ff0000', blend: 'multiply' },
          clip: { x: 5, y: 6, width: 90, height: 18 },
        },
      ],
      options,
    );
    expect(clipped).toMatchObject({
      tag: 'svg',
      attributes: { x: 5, y: 6, width: 90, height: 18, viewBox: '5 6 90 18', overflow: 'hidden' },
    });
    expect(clipped!.children).toEqual([
      {
        tag: 'text',
        // Its spaces too: white-space: pre keeps their room.
        text: ' Hi ',
        attributes: expect.objectContaining({
          x: 10,
          y: 20,
          transform: 'rotate(90 10 20)',
          'font-size': 10,
          'font-family': '"epdf-0123456789abcdef", Helvetica, Arial, sans-serif',
          'font-weight': 700,
          'font-style': 'italic',
          direction: 'ltr',
          'unicode-bidi': 'bidi-override',
          'text-anchor': 'start',
          fill: '#ff0000',
        }),
        style: {
          'white-space': 'pre',
          'font-kerning': 'none',
          'font-variant-ligatures': 'none',
          'mix-blend-mode': 'multiply',
        },
        program,
      },
    ]);
    // The face the text draws in, for the renderer to mount.
    expect(fontProgramsOf([clipped!, clipped!])).toEqual([program]);
  });

  it('draws a right-to-left run right to left, ending at its left edge, shaped with its features', () => {
    const [shape] = svgShapesOf(
      [
        {
          kind: 'textRun',
          at: { x: 40, y: 20 },
          text: 'שלום',
          rtl: true,
          plain: false,
          fontSize: 12,
          fontFamily: '"epdf-hebrew"',
          paint: { fill: '#000000' },
        },
      ],
      options,
    );
    expect(shape).toMatchObject({
      tag: 'text',
      text: 'שלום',
      attributes: {
        x: 40,
        direction: 'rtl',
        'unicode-bidi': 'bidi-override',
        'text-anchor': 'end',
      },
      style: { 'white-space': 'pre' },
    });
  });

  it('draws a letter joined to letters drawn elsewhere with a joiner on each joined side', () => {
    const shape = (joins: { joinsPrevious?: boolean; joinsNext?: boolean }) =>
      svgShapesOf(
        [
          {
            kind: 'textRun',
            at: { x: 40, y: 20 },
            text: 'ب',
            rtl: true,
            plain: false,
            ...joins,
            fontSize: 12,
            fontFamily: '"epdf-arabic"',
            paint: { fill: '#000000' },
          },
        ],
        options,
      )[0]!;
    const run = (joins: { joinsPrevious?: boolean; joinsNext?: boolean }) => shape(joins).text;
    // A comb's cells, each drawn alone, in the forms the whole word gives them.
    expect(run({ joinsPrevious: true, joinsNext: true })).toBe('\u200dب\u200d');
    expect(run({ joinsPrevious: true })).toBe('\u200dب');
    expect(run({ joinsNext: true })).toBe('ب\u200d');
    expect(run({})).toBe('ب');
    // Embedded, not overridden: Firefox drops a joiner at the edge of an overridden run.
    expect(shape({ joinsNext: true }).attributes['unicode-bidi']).toBe('embed');
    expect(shape({}).attributes['unicode-bidi']).toBe('bidi-override');
  });

  it('writes a style as CSS text', () => {
    expect(styleText({ 'white-space': 'pre', 'mix-blend-mode': 'multiply' })).toBe(
      'white-space: pre; mix-blend-mode: multiply',
    );
    expect(styleText(undefined)).toBeUndefined();
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
