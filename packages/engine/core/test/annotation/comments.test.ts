import { describe, expect, it } from 'vitest';

import { buildCommentThreads, isStateAnnotation } from '../../src/shared';
import type { AnnotationDTO, AnnotationRef } from '../../src/shared';

/* The composer only reads identity, relationship, state, and attribution
 * fields; fixtures cast focused literals rather than materialise the full
 * AnnotationBase envelope (same approach as appearance.test.ts). */

const ref = (n: number): AnnotationRef => ({
  kind: 'objectNumber',
  pageObjectNumber: 1,
  annotObjectNumber: n,
});

let autoIndex = 0;
const annot = (n: number, over: Record<string, unknown> = {}): AnnotationDTO =>
  ({
    subtype: 'highlight',
    ref: ref(n),
    pageObjectNumber: 1,
    index: autoIndex++,
    nm: null,
    contents: `annot ${n}`,
    author: null,
    created: null,
    modified: null,
    inReplyTo: null,
    replyType: null,
    ...over,
  }) as unknown as AnnotationDTO;

const reply = (n: number, parent: number, over: Record<string, unknown> = {}): AnnotationDTO =>
  annot(n, { subtype: 'text', state: null, stateModel: null, inReplyTo: ref(parent), replyType: 'reply', ...over });

const state = (
  n: number,
  parent: number | null,
  fields: { state?: string | null; stateModel?: string | null; by?: string; at?: string },
): AnnotationDTO =>
  annot(n, {
    subtype: 'text',
    inReplyTo: parent === null ? null : ref(parent),
    replyType: parent === null ? null : 'reply',
    state: fields.state ?? null,
    stateModel: fields.stateModel ?? null,
    userId: fields.by,
    modified: fields.at ?? null,
  });

const num = (r: AnnotationRef): number => (r.kind === 'objectNumber' ? r.annotObjectNumber : -1);

describe('isStateAnnotation', () => {
  it('requires a text subtype with a non-empty state or stateModel', () => {
    expect(isStateAnnotation(state(1, 2, { state: 'accepted', stateModel: 'review' }))).toBe(true);
    expect(isStateAnnotation(state(1, 2, { stateModel: 'review' }))).toBe(true);
    // Empty strings count as absent — tolerance lives here, not in the DTO.
    expect(isStateAnnotation(state(1, 2, { state: '', stateModel: '' }))).toBe(false);
    expect(isStateAnnotation(reply(1, 2))).toBe(false);
    expect(isStateAnnotation(annot(1, { state: 'accepted' }))).toBe(false); // not text
  });
});

describe('buildCommentThreads — threading', () => {
  it('composes a simple thread with chronological replies', () => {
    const threads = buildCommentThreads([
      annot(1),
      reply(2, 1, { created: '2026-08-28T10:05:00Z' }),
      reply(3, 1, { created: '2026-08-28T10:01:00Z' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(num(threads[0]!.root.ref)).toBe(1);
    expect(threads[0]!.replies.map((r) => num(r.ref))).toEqual([3, 2]);
  });

  it('flattens reply-to-reply chains into one chronological list', () => {
    const threads = buildCommentThreads([
      annot(1),
      reply(2, 1, { created: '2026-08-28T10:01:00Z' }),
      reply(3, 2, { created: '2026-08-28T10:02:00Z' }), // replies to the reply
      reply(4, 3, { created: '2026-08-28T10:03:00Z' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies.map((r) => num(r.ref))).toEqual([2, 3, 4]);
  });

  it('sorts undated replies by z-order, after dated ones', () => {
    const threads = buildCommentThreads([
      annot(1),
      reply(2, 1), // undated, earlier z-order
      reply(3, 1), // undated, later z-order
      reply(4, 1, { created: '2026-08-28T10:00:00Z' }),
    ]);
    expect(threads[0]!.replies.map((r) => num(r.ref))).toEqual([4, 2, 3]);
  });

  it('folds /RT /Group subordinates into groupedParts, never replies', () => {
    const threads = buildCommentThreads([
      annot(1, { subtype: 'strikeout' }),
      annot(2, { subtype: 'caret', inReplyTo: ref(1), replyType: 'group' }),
      reply(3, 1),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.groupedParts.map((g) => num(g.ref))).toEqual([2]);
    expect(threads[0]!.replies.map((r) => num(r.ref))).toEqual([3]);
  });

  it('excludes widgets, links, and unsupported (incl. popups) entirely', () => {
    const threads = buildCommentThreads([
      annot(1, { subtype: 'widget' }),
      annot(2, { subtype: 'link' }),
      annot(3, { subtype: 'unsupported', rawSubtypeCode: 16 }),
      annot(4),
    ]);
    expect(threads).toHaveLength(1);
    expect(num(threads[0]!.root.ref)).toBe(4);
  });

  it('promotes an orphaned reply to its own root', () => {
    const threads = buildCommentThreads([annot(1), reply(2, 999)]);
    expect(threads.map((t) => num(t.root.ref))).toEqual([1, 2]);
  });

  it('survives an /IRT cycle: first member promotes, back-edge dies', () => {
    const threads = buildCommentThreads([
      annot(1, { inReplyTo: ref(2), replyType: 'reply' }),
      annot(2, { inReplyTo: ref(1), replyType: 'reply' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(num(threads[0]!.root.ref)).toBe(1);
    expect(threads[0]!.replies.map((r) => num(r.ref))).toEqual([2]);
  });

  it('resolves a parent addressed by /NM when its own ref is objectNumber-form', () => {
    const threads = buildCommentThreads([
      annot(1, { nm: 'root-nm' }),
      reply(2, 0, { inReplyTo: { kind: 'nm', pageObjectNumber: 1, nm: 'root-nm' } }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.replies).toHaveLength(1);
  });
});

describe('buildCommentThreads — review status', () => {
  it('extracts state annotations into review instead of replies', () => {
    const threads = buildCommentThreads([
      annot(1),
      state(2, 1, { state: 'accepted', stateModel: 'review', by: 'alice', at: '2026-08-28T10:00:00Z' }),
    ]);
    const t = threads[0]!;
    expect(t.replies).toHaveLength(0);
    expect(t.review.lastChange?.state).toBe('accepted');
    expect(t.review.byReviewer['alice']?.state).toBe('accepted');
  });

  it('latest wins per reviewer, chained states included', () => {
    const threads = buildCommentThreads([
      annot(1),
      state(2, 1, { state: 'accepted', stateModel: 'review', by: 'alice', at: '2026-08-28T10:00:00Z' }),
      // ISO chains the update as a reply to the previous state annotation.
      state(3, 2, { state: 'rejected', stateModel: 'review', by: 'alice', at: '2026-08-28T11:00:00Z' }),
    ]);
    const review = threads[0]!.review;
    expect(review.byReviewer['alice']?.state).toBe('rejected');
    expect(review.lastChange?.state).toBe('rejected');
  });

  it('keeps reviewers independent and lastChange overall', () => {
    const threads = buildCommentThreads([
      annot(1),
      state(2, 1, { state: 'accepted', stateModel: 'review', by: 'alice', at: '2026-08-28T10:00:00Z' }),
      state(3, 1, { state: 'rejected', stateModel: 'review', by: 'bob', at: '2026-08-28T12:00:00Z' }),
    ]);
    const review = threads[0]!.review;
    expect(review.byReviewer['alice']?.state).toBe('accepted');
    expect(review.byReviewer['bob']?.state).toBe('rejected');
    expect(review.lastChange?.by).toBe('bob');
  });

  it('keeps the Marked axis out of byReviewer and toggles markedBy', () => {
    const markedOn = buildCommentThreads([
      annot(1),
      state(2, 1, { state: 'marked', stateModel: 'marked', by: 'bob', at: '2026-08-28T10:00:00Z' }),
    ]);
    expect(markedOn[0]!.review.markedBy).toEqual(['bob']);
    expect(markedOn[0]!.review.byReviewer).toEqual({});
    expect(markedOn[0]!.review.lastChange).toBe(null);

    const toggledOff = buildCommentThreads([
      annot(1),
      state(2, 1, { state: 'marked', stateModel: 'marked', by: 'bob', at: '2026-08-28T10:00:00Z' }),
      state(3, 2, { state: 'unmarked', stateModel: 'marked', by: 'bob', at: '2026-08-28T11:00:00Z' }),
    ]);
    expect(toggledOff[0]!.review.markedBy).toEqual([]);
  });

  it('applies ISO defaults: model without state, state without model', () => {
    const threads = buildCommentThreads([
      annot(1),
      state(2, 1, { stateModel: 'review', by: 'alice', at: '2026-08-28T10:00:00Z' }),
      state(3, 1, { state: 'accepted', by: 'bob', at: '2026-08-28T11:00:00Z' }),
    ]);
    const review = threads[0]!.review;
    expect(review.byReviewer['alice']?.state).toBe('none');
    expect(review.byReviewer['bob']).toMatchObject({ state: 'accepted', stateModel: 'review' });
  });

  it('round-trips custom models verbatim and skips undeterminable ones', () => {
    const threads = buildCommentThreads([
      annot(1),
      state(2, 1, { state: 'in-progress', stateModel: 'X-ReviewWorkflow', by: 'alice', at: '2026-08-28T10:00:00Z' }),
      state(3, 1, { stateModel: 'X-Other', by: 'bob', at: '2026-08-28T11:00:00Z' }), // no derivable state
      state(4, 1, { state: 'escalated', by: 'carol', at: '2026-08-28T12:00:00Z' }), // custom state, no model
    ]);
    const review = threads[0]!.review;
    expect(review.byReviewer['alice']).toMatchObject({
      state: 'in-progress',
      stateModel: 'X-ReviewWorkflow',
    });
    expect(review.byReviewer['bob']).toBeUndefined();
    expect(review.byReviewer['carol']).toBeUndefined();
    expect(review.lastChange?.by).toBe('alice');
  });

  it('drops a state annotation whose target is unresolvable', () => {
    const threads = buildCommentThreads([
      annot(1),
      state(2, 999, { state: 'accepted', stateModel: 'review', by: 'alice' }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.review.lastChange).toBe(null);
  });

  it('falls back to /T for the reviewer key and skips unattributed states in byReviewer', () => {
    const threads = buildCommentThreads([
      annot(1),
      state(2, 1, { state: 'accepted', stateModel: 'review', at: '2026-08-28T10:00:00Z' }),
      annot(3, {
        subtype: 'text',
        inReplyTo: ref(1),
        replyType: 'reply',
        state: 'rejected',
        stateModel: 'review',
        author: 'Alice (T)',
        modified: '2026-08-28T09:00:00Z',
      }),
    ]);
    const review = threads[0]!.review;
    expect(review.byReviewer['Alice (T)']?.state).toBe('rejected');
    // The unattributed (no userId, no /T) state still drives lastChange.
    expect(review.lastChange?.state).toBe('accepted');
    expect(review.lastChange?.by).toBe(null);
  });

  it('computes mine only when currentUserId is given', () => {
    const input = [
      annot(1),
      state(2, 1, { state: 'accepted', stateModel: 'review', by: 'alice', at: '2026-08-28T10:00:00Z' }),
    ];
    expect(buildCommentThreads(input)[0]!.review.mine).toBeUndefined();
    expect(buildCommentThreads(input, { currentUserId: 'alice' })[0]!.review.mine?.state).toBe(
      'accepted',
    );
    expect(buildCommentThreads(input, { currentUserId: 'bob' })[0]!.review.mine).toBe(null);
  });

  it('treats empty-string state fields as a regular reply', () => {
    const threads = buildCommentThreads([
      annot(1),
      annot(2, {
        subtype: 'text',
        inReplyTo: ref(1),
        replyType: 'reply',
        state: '',
        stateModel: '',
        contents: 'just a reply',
      }),
    ]);
    expect(threads[0]!.replies).toHaveLength(1);
    expect(threads[0]!.review.lastChange).toBe(null);
  });
});
