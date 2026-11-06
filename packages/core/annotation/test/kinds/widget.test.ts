/**
 * Which kind a widget is: its field family's, or, with a mark in it, the
 * mark's, which has no style to offer.
 */
import type { Annotation } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { kindOf, propertiesOf } from '../../src';

const widget = (fieldKind: string, hasMark: boolean) =>
  ({ subtype: 'widget', fieldKind, hasMark }) as unknown as Annotation;

/** A kind's style rows: its properties but the flags every kind has. */
const styleOf = (annotation: Annotation) =>
  propertiesOf(kindOf(annotation))
    .filter((property) => property.control !== 'flag')
    .map((property) => property.key);

describe("a widget's kind", () => {
  it("is its field kind's: a signature field's is the box, with the box's style", () => {
    expect(kindOf(widget('text', false)).name).toBe('widget-text');
    expect(kindOf(widget('signature', false)).name).toBe('widget-box');
    expect(styleOf(widget('signature', false))).toEqual([
      'color',
      'interiorColor',
      'strokeWidth',
      'borderStyle',
    ]);
  });

  it('with a mark in it, is the mark: no style', () => {
    expect(kindOf(widget('signature', true)).name).toBe('widget-mark');
    expect(styleOf(widget('signature', true))).toEqual([]);
  });
});
