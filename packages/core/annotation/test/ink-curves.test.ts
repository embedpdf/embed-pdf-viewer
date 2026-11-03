import { describe, expect, it } from 'vitest';

import { fitInkStroke, inkCurvesPath, type InkStrokeCurves } from '../src/ink-curves';
import type { Point } from '../src/types';

/**
 * Ink annotations Acrobat drew from their `/InkList` alone, on save
 * (ink-curves.pdf, Nov 3 2026), in the file's own space: each stroke's
 * points, and the path of the appearance Acrobat wrote for it (its `m` and
 * `c` lines). The runtime's embedder tests hold the same cases.
 */
const ACROBAT: Array<{ name: string; points: number[]; path: string }> = [
  {
    name: 'A: uneven segments',
    points: [60, 620, 75, 680, 160, 700, 175, 630, 300, 640],
    path: `60 620 m
      65 640 58.902 667.1216 75 680 c
      97.7288 698.183 133.9659 713.0171 160 700 c
      181.3438 689.3281 153.0664 639.4001 175 630 c
      213.4201 613.5342 258.3333 636.6667 300 640 c`,
  },
  {
    name: 'B: two points',
    points: [60, 520, 200, 580],
    path: `60 520 m
      106.6667 540 153.3333 560 200 580 c`,
  },
  {
    name: 'D: a point repeated',
    points: [330, 520, 330, 520, 370, 580, 410, 520],
    path: `330 520 m
      343.3333 540 345.963 580 370 580 c
      394.037 580 396.6667 540 410 520 c`,
  },
  {
    name: 'E: straight back on itself',
    points: [60, 420, 140, 470, 60, 420],
    path: `60 420 m
      86.6667 436.6667 140 470 140 470 c
      140 470 86.6667 436.6667 60 420 c`,
  },
  {
    name: 'F: two strokes, the first',
    points: [220, 420, 260, 470, 300, 420],
    path: `220 420 m
      233.3333 436.6667 238.6563 470 260 470 c
      281.3438 470 286.6667 436.6667 300 420 c`,
  },
  {
    name: 'F: two strokes, the second',
    points: [330, 420, 370, 470, 410, 440],
    path: `330 420 m
      343.3333 436.6667 349.2935 464.8234 370 470 c
      386.169 474.0423 396.6667 450 410 440 c`,
  },
  {
    name: 'G: a tight turn between long runs',
    points: [60, 320, 200, 330, 205, 300, 60, 290],
    path: `60 320 m
      106.6667 323.3333 153.6532 336.3927 200 330 c
      210.0429 328.6148 214.7479 302.7851 205 300 c
      158.416 286.6903 108.3333 293.3333 60 290 c`,
  },
  {
    name: 'H: dense, like a real pen',
    points: Array.from({ length: 40 }, (_, i) => [260 + i * 3, 300 + (i % 2) * 2 + i * 0.5]).flat(),
    path: `260 300 m
      268.7073 307.2561 257.6714 299.6119 266 301 c
      267.284 301.214 267.716 303.286 269 303.5 c
      270.1028 303.6838 270.8972 301.8162 272 302 c
      273.284 302.214 273.716 304.286 275 304.5 c
      276.1028 304.6838 276.8972 302.8162 278 303 c
      279.284 303.214 279.716 305.286 281 305.5 c
      282.1028 305.6838 282.8972 303.8162 284 304 c
      285.284 304.214 285.716 306.286 287 306.5 c
      288.1028 306.6838 288.8972 304.8162 290 305 c
      291.284 305.214 291.716 307.286 293 307.5 c
      294.1028 307.6838 294.8972 305.8162 296 306 c
      297.284 306.214 297.716 308.286 299 308.5 c
      300.1028 308.6838 300.8972 306.8162 302 307 c
      303.284 307.214 303.716 309.286 305 309.5 c
      306.1028 309.6838 306.8972 307.8162 308 308 c
      309.284 308.214 309.716 310.286 311 310.5 c
      312.1028 310.6838 312.8972 308.8162 314 309 c
      315.284 309.214 315.716 311.286 317 311.5 c
      318.1028 311.6838 318.8972 309.8162 320 310 c
      321.284 310.214 321.716 312.286 323 312.5 c
      324.1028 312.6838 324.8972 310.8162 326 311 c
      327.284 311.214 327.716 313.286 329 313.5 c
      330.1028 313.6838 330.8972 311.8162 332 312 c
      333.284 312.214 333.716 314.286 335 314.5 c
      336.1028 314.6838 336.8972 312.8162 338 313 c
      339.284 313.214 339.716 315.286 341 315.5 c
      342.1028 315.6838 342.8972 313.8162 344 314 c
      345.284 314.214 345.716 316.286 347 316.5 c
      348.1028 316.6838 348.8972 314.8162 350 315 c
      351.284 315.214 351.716 317.286 353 317.5 c
      354.1028 317.6838 354.8972 315.8162 356 316 c
      357.284 316.214 357.716 318.286 359 318.5 c
      360.1028 318.6838 360.8972 316.8162 362 317 c
      363.284 317.214 363.716 319.286 365 319.5 c
      366.1028 319.6838 366.8972 317.8162 368 318 c
      369.284 318.214 369.716 320.286 371 320.5 c
      379.3286 321.8881 368.2927 314.2439 377 321.5 c`,
  },
];

const pointsOf = (numbers: number[]): Point[] =>
  Array.from({ length: numbers.length / 2 }, (_, i) => ({
    x: numbers[2 * i]!,
    y: numbers[2 * i + 1]!,
  }));

/** A path's numbers: the start, then each cubic's six. */
const pathNumbers = (path: string): number[] =>
  path
    .split(/\s+/)
    .filter((token) => token && token !== 'm' && token !== 'c')
    .map(Number);

const numbersOf = (curves: InkStrokeCurves | null): number[] => {
  if (curves?.kind !== 'curves') return [];
  return [
    curves.start.x,
    curves.start.y,
    ...curves.cubics.flatMap(({ control1, control2, end }) => [
      control1.x,
      control1.y,
      control2.x,
      control2.y,
      end.x,
      end.y,
    ]),
  ];
};

const DENSE = pointsOf(ACROBAT.find((one) => one.name.startsWith('H'))!.points);

const cubicCount = (stroke: Point[], tolerance?: number): number => {
  const curves = fitInkStroke(stroke, tolerance);
  return curves?.kind === 'curves' ? curves.cubics.length : 0;
};

describe('ink is drawn as Acrobat draws it', () => {
  it.each(ACROBAT)('$name: the same cubics, to 0.001 pt', ({ points, path }) => {
    const expected = pathNumbers(path);
    const actual = numbersOf(fitInkStroke(pointsOf(points)));
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, i) => expect(Math.abs(value - expected[i]!)).toBeLessThan(0.001));
  });

  it('the dense zigzag pins the tolerance: 37 cubics from above 1.2747 to 1.5062', () => {
    expect(cubicCount(DENSE)).toBe(37);
    expect(cubicCount(DENSE, 1.28)).toBe(37);
    expect(cubicCount(DENSE, 1.5)).toBe(37);
    expect(cubicCount(DENSE, 1.27)).toBe(39);
    expect(cubicCount(DENSE, 1.51)).toBe(33);
  });

  it('a stroke of one point is a dot, however often it repeats; no points, nothing', () => {
    expect(fitInkStroke([{ x: 260, y: 550 }])).toEqual({ kind: 'dot', center: { x: 260, y: 550 } });
    expect(
      fitInkStroke([
        { x: 260, y: 550 },
        { x: 260, y: 550 },
      ]),
    ).toEqual({ kind: 'dot', center: { x: 260, y: 550 } });
    expect(fitInkStroke([])).toBeNull();
  });

  it('page space draws the same curves: the fit only measures distances', () => {
    const height = 792;
    const flip = (point: Point): Point => ({ x: point.x, y: height - point.y });
    const pdf = fitInkStroke(pointsOf(ACROBAT[0]!.points));
    const page = fitInkStroke(pointsOf(ACROBAT[0]!.points).map(flip));
    const flipped = numbersOf(pdf).map((value, i) => (i % 2 ? height - value : value));
    numbersOf(page).forEach((value, i) => expect(value).toBeCloseTo(flipped[i]!, 9));
  });

  it('as SVG path data: a move to the start, then each cubic', () => {
    const curves = fitInkStroke([
      { x: 60, y: 520 },
      { x: 200, y: 580 },
    ]);
    expect(curves?.kind === 'curves' && inkCurvesPath(curves)).toBe(
      'M 60 520 C 106.6667 540 153.3333 560 200 580',
    );
  });
});
