/**
 * Which colour rows a style panel offers none on: the ones whose `null` still
 * leaves something drawn. A shape or a line without a stroke keeps its fill
 * and its endings; ink, markup and text colours are the mark itself.
 */
import { describe, expect, it } from 'vitest';

import { KINDS, propertiesOf } from '../../src';

const WIDGETS = ['widget-box', 'widget-button', 'widget-choice', 'widget-radio', 'widget-text'];

describe('a colour row that offers none', () => {
  it('is a stroke or fill of a shape or line, a background, or a form field border', () => {
    const offered = Object.values(KINDS).flatMap((kind) =>
      propertiesOf(kind)
        .filter((property) => property.control === 'color' && property.allowsNone)
        .map((property) => `${kind.name} ${property.key}`),
    );
    expect(offered.sort()).toEqual(
      [
        ...['square', 'circle', 'polygon', 'line', 'polyline'].flatMap((name) => [
          `${name} color`,
          `${name} interiorColor`,
        ]),
        'free-text interiorColor',
        'free-text-callout interiorColor',
        'redact interiorColor',
        ...[...WIDGETS, 'widget-toggle'].flatMap((name) => [
          `${name} color`,
          `${name} interiorColor`,
        ]),
      ].sort(),
    );
  });

  it('is never ink or a markup colour', () => {
    for (const name of ['ink', 'highlight', 'underline', 'strikeout', 'squiggly']) {
      const color = propertiesOf(KINDS[name]!).find((property) => property.key === 'color');
      expect(color && 'allowsNone' in color && color.allowsNone).toBeFalsy();
    }
  });
});
