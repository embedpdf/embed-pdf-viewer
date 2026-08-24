import { describe, expect, it } from 'vitest';

import { NO_ANNOTATION_FLAGS } from '../../src/annotation/primitives';
import { buildThreads, classifyRelation, refKey } from '../../src/annotation/relationships';
import type { AnnotationDTO } from '../../src/annotation/kinds';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import type { AnnotationReplyType } from '../../src/annotation/primitives';

const PAGE = 1;

function objRef(objNum: number): AnnotationRef {
  return { kind: 'objectNumber', pageObjectNumber: PAGE, annotObjectNumber: objNum };
}

/**
 * Minimal highlight DTO carrying just the fields `buildThreads` /
 * `classifyRelation` read. We cast through `unknown` because the family
 * fields are irrelevant to relationship composition.
 */
function annot(
  objNum: number,
  rel: {
    inReplyTo?: AnnotationRef | null;
    replyType?: AnnotationReplyType | null;
    nm?: string;
  } = {},
): AnnotationDTO {
  return {
    ref: objRef(objNum),
    pageObjectNumber: PAGE,
    index: 0,
    identityQuality: 'durable',
    nm: rel.nm ?? null,
    flags: NO_ANNOTATION_FLAGS,
    rect: { left: 0, top: 10, right: 10, bottom: 0 },
    contents: null,
    author: null,
    created: null,
    modified: null,
    inReplyTo: rel.inReplyTo ?? null,
    replyType: rel.replyType ?? null,
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
    expect(classifyRelation(annot(2, { inReplyTo: objRef(1), replyType: 'reply' }))).toBe('reply');
  });

  it('returns reply for /IRT with no replyType (ISO default)', () => {
    expect(classifyRelation(annot(2, { inReplyTo: objRef(1), replyType: null }))).toBe('reply');
  });

  it('returns grouped-subordinate for /IRT with replyType group', () => {
    expect(classifyRelation(annot(2, { inReplyTo: objRef(1), replyType: 'group' }))).toBe(
      'grouped-subordinate',
    );
  });
});

describe('refKey', () => {
  it('is stable and distinct per ref kind', () => {
    expect(refKey(objRef(7))).toBe('obj:1:7');
    expect(refKey({ kind: 'nm', pageObjectNumber: PAGE, nm: 'abc' })).toBe('nm:1:abc');
  });
});

describe('buildThreads', () => {
  it('attaches a reply under its primary', () => {
    const primary = annot(1);
    const reply = annot(2, { inReplyTo: objRef(1), replyType: 'reply' });
    const threads = buildThreads([primary, reply]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.primary).toBe(primary);
    expect(threads[0]!.replies).toEqual([reply]);
    expect(threads[0]!.groupedParts).toEqual([]);
  });

  it('treats a missing /RT child as a reply (default)', () => {
    const primary = annot(1);
    const reply = annot(2, { inReplyTo: objRef(1), replyType: null });
    const threads = buildThreads([primary, reply]);

    expect(threads[0]!.replies).toEqual([reply]);
  });

  it('folds a group subordinate into groupedParts, not replies', () => {
    const primary = annot(1);
    const caret = annot(2, { inReplyTo: objRef(1), replyType: 'group' });
    const threads = buildThreads([primary, caret]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.groupedParts).toEqual([caret]);
    expect(threads[0]!.replies).toEqual([]);
  });

  it('supports a primary with both a group part and a reply', () => {
    const primary = annot(1);
    const caret = annot(2, { inReplyTo: objRef(1), replyType: 'group' });
    const reply = annot(3, { inReplyTo: objRef(1), replyType: 'reply' });
    const threads = buildThreads([primary, caret, reply]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.groupedParts).toEqual([caret]);
    expect(threads[0]!.replies).toEqual([reply]);
  });

  it('matches a child that points at the parent by /NM', () => {
    const primary = annot(1, { nm: 'parent-nm' });
    const reply = annot(2, {
      inReplyTo: { kind: 'nm', pageObjectNumber: PAGE, nm: 'parent-nm' },
      replyType: 'reply',
    });
    const threads = buildThreads([primary, reply]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies).toEqual([reply]);
  });

  it('surfaces an orphan (parent not in the set) as its own primary', () => {
    const orphan = annot(2, { inReplyTo: objRef(99), replyType: 'reply' });
    const threads = buildThreads([orphan]);

    expect(threads).toHaveLength(1);
    expect(threads[0]!.primary).toBe(orphan);
    expect(threads[0]!.replies).toEqual([]);
  });

  it('preserves primary order from the input', () => {
    const p1 = annot(1);
    const p2 = annot(2);
    const r1 = annot(3, { inReplyTo: objRef(1), replyType: 'reply' });
    const threads = buildThreads([p1, p2, r1]);

    expect(threads.map((t) => t.primary)).toEqual([p1, p2]);
    expect(threads[0]!.replies).toEqual([r1]);
    expect(threads[1]!.replies).toEqual([]);
  });
});
