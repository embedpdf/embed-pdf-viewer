import { describe, expect, test } from 'vitest';

import { ANNOTATION_KIND_FACTS } from '../../src/annotation/kind-facts.generated';
import {
  canChangeKind,
  fieldTheKindCannotHold,
  SIBLING_KINDS,
  siblingKindsOf,
} from '../../src/annotation/siblings';

describe('SIBLING_KINDS', () => {
  test.each(SIBLING_KINDS.map((group) => [group.join(', '), group]))(
    '%s declare the same fields, apart from a strikeout intent',
    (_, group) => {
      const [first, ...rest] = group;
      const facts = ANNOTATION_KIND_FACTS[first!];
      for (const kind of rest) {
        const other = ANNOTATION_KIND_FACTS[kind];
        const only = (a: object, b: object) => Object.keys(a).filter((name) => !(name in b));
        expect([...only(facts.owners, other.owners), ...only(other.owners, facts.owners)]).toEqual(
          kind === 'strikeout' ? ['intent'] : [],
        );
        // What they share, they share whole: owner, read-back, color and space.
        for (const name of Object.keys(facts.owners).filter((field) => field in other.owners)) {
          expect(other.owners[name]).toBe(facts.owners[name]);
          expect(other.readBack.includes(name)).toBe(facts.readBack.includes(name));
          expect(other.colors.includes(name)).toBe(facts.colors.includes(name));
          expect(other.spaces[name]).toEqual(facts.spaces[name]);
        }
      }
    },
  );
});

describe('siblingKindsOf', () => {
  test('a kind can become the others of its group', () => {
    expect(siblingKindsOf('highlight')).toEqual(['underline', 'squiggly', 'strikeout']);
    expect(siblingKindsOf('strikeout')).toEqual(['highlight', 'underline', 'squiggly']);
    expect(siblingKindsOf('circle')).toEqual(['square']);
  });

  test('every other kind keeps its subtype', () => {
    for (const kind of ['ink', 'line', 'polygon', 'polyline', 'redact', 'widget', 'unsupported']) {
      expect(siblingKindsOf(kind)).toEqual([]);
    }
    expect(siblingKindsOf('no-such-kind')).toEqual([]);
  });
});

describe('canChangeKind', () => {
  const highlight = { subtype: 'highlight', color: '#ffff00', quadPoints: [] };
  const replacement = { subtype: 'strikeout', intent: 'strikeout-text-edit', quadPoints: [] };

  test('a sibling, holding nothing the new kind lacks', () => {
    const cleared = { ...replacement, intent: null };
    expect(canChangeKind(highlight, 'underline')).toBe(true);
    expect(canChangeKind(cleared, 'highlight')).toBe(true);
    expect(fieldTheKindCannotHold(highlight, 'strikeout')).toBeNull();
  });

  test('not another family, nor over a value the new kind lacks', () => {
    expect(canChangeKind(highlight, 'ink')).toBe(false);
    expect(canChangeKind(highlight, 'highlight')).toBe(false);
    expect(canChangeKind(replacement, 'highlight')).toBe(false);
    expect(fieldTheKindCannotHold(replacement, 'highlight')).toBe('intent');
  });
});
