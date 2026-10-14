import { describe, expect, test } from 'vitest';

import { appearanceModesOf, shownAppearances } from '../../src/dto/AnnotationRender';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import { toPageRef } from '../../src/identity/PageRef';

const ref = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: toPageRef(3),
  objectNumber,
});

describe('appearanceModesOf', () => {
  test('every mode, asked or left out, is one request', () => {
    expect(appearanceModesOf(undefined)).toBeUndefined();
    expect(appearanceModesOf(['down', 'normal', 'rollover'])).toBeUndefined();
  });

  test('some modes come back once each, in the engine order', () => {
    expect(appearanceModesOf(['down', 'normal', 'down'])).toEqual(['normal', 'down']);
  });

  test('an empty list is refused', () => {
    expect(() => appearanceModesOf([])).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
    );
  });
});

describe('shownAppearances', () => {
  const box = ref(10);
  const square = ref(11);
  const appearances = [
    { ref: box, mode: 'normal', state: 'Off' },
    { ref: box, mode: 'normal', state: 'Yes' },
    { ref: box, mode: 'down', state: 'Yes' },
    { ref: box, mode: 'rollover', state: 'Yes' },
    { ref: square, mode: 'normal', state: null },
    { ref: square, mode: 'down', state: null },
  ] as const;

  test('each annotation shows its look at rest, in the state it names', () => {
    const shown = shownAppearances(appearances, [
      { ref: box, appearanceState: 'Yes' },
      { ref: square, appearanceState: null },
    ]);
    expect(shown).toEqual([
      { ref: box, mode: 'normal', state: 'Yes' },
      { ref: square, mode: 'normal', state: null },
    ]);
  });

  test('an annotation that names no state shows Off, as PDFium draws it', () => {
    const shown = shownAppearances(appearances, [{ ref: box, appearanceState: null }]);
    expect(shown.filter((appearance) => appearance.ref === box)).toEqual([
      { ref: box, mode: 'normal', state: 'Off' },
    ]);
  });

  test('a state with no picture shows nothing', () => {
    const shown = shownAppearances(appearances, [{ ref: box, appearanceState: 'Maybe' }]);
    expect(shown.filter((appearance) => appearance.ref === box)).toEqual([]);
  });
});
