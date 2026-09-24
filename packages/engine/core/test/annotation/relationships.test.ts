import { describe, expect, it } from 'vitest';

import { NO_ANNOTATION_FLAGS } from '../../src/annotation/primitives';
import { buildThreads, classifyRelation } from '../../src/annotation/relationships';
import { annotationKey, refFromStableId } from '../../src/identity/annotationKey';
import type { AnnotationDTO } from '../../src/annotation/kinds';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import type { AnnotationReplyType } from '../../src/annotation/primitives';

const PAGE = 1;

function objRef(objNum: number): AnnotationRef {
  return {
    kind: 'objectNumber',
    page: { kind: 'objectNumber', pageObjectNumber: PAGE },
    annotObjectNumber: objNum,
  };
}

/**
 * Minimal highlight DTO carrying just the fields `buildThreads` /
 * `classifyRelation` read. We cast through `unknown` because the family
 * fields are irrelevant to relationship composition.
 */
function annot(
  objNum: number,
  rel: {
    reply?: { to: AnnotationRef; type: AnnotationReplyType } | null;
    nm?: string;
  } = {},
): AnnotationDTO {
  return {
    ref: objRef(objNum),
    page: { kind: 'objectNumber', pageObjectNumber: PAGE },
    index: 0,
    identityQuality: 'durable',
    nm: rel.nm ?? null,
    ...NO_ANNOTATION_FLAGS,
    rect: { left: 0, top: 10, right: 10, bottom: 0 },
    contents: null,
    author: null,
    created: null,
    modified: null,
    reply: rel.reply ?? null,
    subtype: 'highlight',
    color: { r: 0, g: 0, b: 0 },
    opacity: 1,
    quadPoints: [],
  } as unknown as AnnotationDTO;
}

describe('classifyRelation', () => {
  it('returns top-level when there is no /IRT', () => {
    expect(classifyRelation(annot(1))).toBe('top-level');
  });

  it('returns reply for /IRT with replyType reply', () => {
    expect(classifyRelation(annot(2, { reply: { to: objRef(1), type: 'reply' } }))).toBe('reply');
  });

  it('returns grouped-subordinate for /IRT with replyType group', () => {
    expect(classifyRelation(annot(2, { reply: { to: objRef(1), type: 'group' } }))).toBe(
      'grouped-subordinate',
    );
  });
});

describe('annotationKey', () => {
  it('drops the page for object numbers (document-unique) and keeps it for names and indexes', () => {
    expect(annotationKey(objRef(7))).toBe('obj:7');
    expect(
      annotationKey({
        kind: 'nm',
        page: { kind: 'objectNumber', pageObjectNumber: PAGE },
        nm: 'abc',
      }),
    ).toBe('nm:1:abc');
    expect(
      annotationKey({
        kind: 'index',
        page: { kind: 'objectNumber', pageObjectNumber: PAGE },
        index: 3,
        revision: 'r1' as never,
      }),
    ).toBe('idx:1:3');
  });

  it('agrees with the wire member key for durable object numbers', () => {
    // encodeStableIdKey({ kind: 'objectNumber', value: 7 }) === 'obj:7'
    expect(annotationKey(objRef(7))).toBe('obj:7');
  });

  it('refFromStableId rebuilds the address an event split into page + stable id', () => {
    const page = { kind: 'objectNumber' as const, pageObjectNumber: PAGE };
    expect(refFromStableId(page, { kind: 'objectNumber', value: 7 })).toEqual(objRef(7));
    expect(annotationKey(refFromStableId(page, { kind: 'nm', value: 'abc' }))).toBe('nm:1:abc');
  });
});

describe('buildThreads', () => {
  it('attaches a reply under its primary', () => {
    const primary = annot(1);
    const reply = annot(2, { reply: { to: objRef(1), type: 'reply' } });
    const threads = buildThreads([primary, reply]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.primary).toBe(primary);
    expect(threads[0]!.replies).toEqual([reply]);
    expect(threads[0]!.groupedParts).toEqual([]);
  });

  it('treats a missing /RT child as a reply (default)', () => {
    const primary = annot(1);
    const reply = annot(2, { reply: { to: objRef(1), type: 'reply' } });
    const threads = buildThreads([primary, reply]);

    expect(threads[0]!.replies).toEqual([reply]);
  });

  it('folds a group subordinate into groupedParts, not replies', () => {
    const primary = annot(1);
    const caret = annot(2, { reply: { to: objRef(1), type: 'group' } });
    const threads = buildThreads([primary, caret]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.groupedParts).toEqual([caret]);
    expect(threads[0]!.replies).toEqual([]);
  });

  it('supports a primary with both a group part and a reply', () => {
    const primary = annot(1);
    const caret = annot(2, { reply: { to: objRef(1), type: 'group' } });
    const reply = annot(3, { reply: { to: objRef(1), type: 'reply' } });
    const threads = buildThreads([primary, caret, reply]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.groupedParts).toEqual([caret]);
    expect(threads[0]!.replies).toEqual([reply]);
  });

  it('matches a child that points at the parent by /NM', () => {
    const primary = annot(1, { nm: 'parent-nm' });
    const reply = annot(2, {
      reply: {
        to: {
          kind: 'nm',
          page: { kind: 'objectNumber', pageObjectNumber: PAGE },
          nm: 'parent-nm',
        },
        type: 'reply',
      },
    });
    const threads = buildThreads([primary, reply]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies).toEqual([reply]);
  });

  it('surfaces an orphan (parent not in the set) as its own primary', () => {
    const orphan = annot(2, { reply: { to: objRef(99), type: 'reply' } });
    const threads = buildThreads([orphan]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.primary).toBe(orphan);
    expect(threads[0]!.replies).toEqual([]);
  });

  it('preserves primary order from the input', () => {
    const p1 = annot(1);
    const p2 = annot(2);
    const r1 = annot(3, { reply: { to: objRef(1), type: 'reply' } });
    const threads = buildThreads([p1, p2, r1]);

    expect(threads.map((t) => t.primary)).toEqual([p1, p2]);
    expect(threads[0]!.replies).toEqual([r1]);
    expect(threads[1]!.replies).toEqual([]);
  });
});
