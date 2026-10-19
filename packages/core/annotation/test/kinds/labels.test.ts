/**
 * Every word a style panel shows from the kind table has its translation key: each property's
 * label and each option's. A key names one wording, so it has one English label wherever it
 * is used, and the same field may have different keys on different kinds.
 */
import { describe, expect, it } from 'vitest';

import { KINDS, propertiesOf, type AnnotationKind } from '../../src';

/** Every label the table holds, as `[labelKey, label, where]`. */
function labelsOf(kinds: readonly AnnotationKind[]): [string, string, string][] {
  return kinds.flatMap((kind) =>
    propertiesOf(kind).flatMap((property): [string, string, string][] => [
      [property.labelKey, property.label, `${kind.name} ${property.key}`],
      ...('options' in property
        ? property.options.map((option): [string, string, string] => [
            option.labelKey,
            option.label,
            `${kind.name} ${property.key} ${option.value}`,
          ])
        : []),
    ]),
  );
}

describe('the style labels', () => {
  const labels = labelsOf(Object.values(KINDS));

  it('give every property and every option an English label and a key under annotation.', () => {
    for (const [labelKey, label, where] of labels) {
      expect({ where, labelKey, label }).toEqual({
        where,
        labelKey: expect.stringMatching(/^annotation\.[a-zA-Z]+\.[a-zA-Z]+$/),
        label: expect.stringMatching(/\S/),
      });
    }
  });

  it('give each key one English label wherever it is used', () => {
    const byKey = new Map<string, Set<string>>();
    for (const [labelKey, label] of labels) {
      byKey.set(labelKey, (byKey.get(labelKey) ?? new Set()).add(label));
    }
    const split = [...byKey].filter(([, words]) => words.size > 1);
    expect(split).toEqual([]);
  });

  it('name the wording, not the field: one field is called different things by different kinds', () => {
    const keyOf = (name: string, key: string) =>
      propertiesOf(KINDS[name]!).find((property) => property.key === key)?.labelKey;
    expect(keyOf('square', 'color')).toBe('annotation.style.stroke');
    expect(keyOf('redact', 'color')).toBe('annotation.style.outline');
    expect(keyOf('highlight', 'color')).toBe('annotation.style.color');
  });
});
