import {
  runPageTextObjectsConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { drawingOrder, type TextObjectChar } from '@embedpdf/engine-services';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { localEngine } from '../src/index';

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runPageTextObjectsConformance(runner, {
  label: 'local engine (wasm runtime)',
  makeEngine: () => localEngine({ runtime: { prefer: 'wasm' } }),
});

const char = (index: number, unicode: string, x: number, width = 5): TextObjectChar => ({
  index,
  unicode,
  x,
  y: 0,
  width,
});

describe('drawingOrder', () => {
  test('keeps left-to-right text as it is', () => {
    const { glyphs, reversed } = drawingOrder(
      [char(0, 'a', 0), char(1, 'b', 5), char(2, 'c', 10)],
      [1, 0, 0, 1, 0, 0],
      [false, false, false],
    );
    expect(reversed).toBe(false);
    expect(glyphs.map((g) => g.unicode).join('')).toBe('abc');
    expect(glyphs.map((g) => g.advance)).toEqual([5, 5, 5]);
  });

  test('puts reversed text back in pen order and un-mirrors brackets', () => {
    // Logical order as the text page keeps it: "(אב)" drawn right to left.
    const { glyphs, reversed } = drawingOrder(
      [char(0, '(', 15), char(1, 'א', 10), char(2, 'ב', 5), char(3, ')', 0)],
      [1, 0, 0, 1, 0, 0],
      [true, true, true, true],
    );
    expect(reversed).toBe(true);
    expect(glyphs.map((g) => g.index)).toEqual([3, 2, 1, 0]);
    expect(glyphs.map((g) => g.unicode).join('')).toBe('(בא)');
  });

  test('draws trailing spaces of reversed text first', () => {
    const { glyphs } = drawingOrder(
      [char(0, 'א', 10), char(1, 'ב', 5), char(2, ' ', 20)],
      [1, 0, 0, 1, 0, 0],
      [true, true, true],
    );
    expect(glyphs.map((g) => g.index)).toEqual([2, 1, 0]);
    expect(glyphs[0].space).toBe(true);
  });

  test('glyphs on one pen position are stacked, reversed on right-to-left lines', () => {
    const { glyphs } = drawingOrder(
      [char(0, 'א', 0, 0), char(1, 'ב', 0, 0)],
      [1, 0, 0, 1, 0, 0],
      [true, true],
    );
    expect(glyphs.map((g) => g.index)).toEqual([1, 0]);
    expect(glyphs.every((g) => g.stacked)).toBe(true);
  });
});
