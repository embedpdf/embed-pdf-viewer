import {
  DRAWN_FLAGS,
  groupOf,
  initialSession,
  type ModelAnnotation,
  refOf,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  annotationOfDraft,
  toPageRef,
  type AnnotationDraft,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  changedFields,
  followRecord,
  initialAnnotationState,
  stage,
  writeSettled,
  type AnnotationState,
  type PendingChange,
} from '../src/model';

describe('pending changes', () => {
  const PAGE = toPageRef(1);
  /** The `nm` ref a record this session creates is written under. */
  const named = (name: string): AnnotationRef => ({ kind: 'nm', page: PAGE, nm: name });
  /**
   * A record this session created, keyed by the ref it is written under;
   * `reply` names the annotation it answers.
   */
  const record = (
    name: string,
    reply?: { to: AnnotationRef; type: 'reply' | 'group' },
  ): ModelAnnotation => {
    const draft = {
      subtype: 'square',
      box: { x: 0, y: 0, width: 10, height: 10 },
      color: '#e5484d',
      strokeWidth: 2,
      ...DRAWN_FLAGS,
      nm: name,
    } as AnnotationDraft;
    const annotation = annotationOfDraft(draft, { ref: named(name), index: 0 });
    return {
      id: annotationKey(named(name)),
      unconfirmed: true,
      source: 'baked',
      annotation: reply ? { ...annotation, reply } : annotation,
    };
  };
  const edit = (token: number, id: string, fields: Partial<ModelAnnotation>): PendingChange => ({
    token,
    id,
    change: { kind: 'edit', fields },
  });
  const withPending = (pending: PendingChange[]): AnnotationState => ({
    ...initialAnnotationState(),
    pending,
  });
  const tokens = (state: { pending: readonly PendingChange[] }) =>
    state.pending.map((change) => change.token);

  it('changedFields holds exactly the fields a message changed, beside the annotation', () => {
    const before = record('a');
    const after = {
      ...before,
      source: 'vector' as const,
      apBox: { x: 1, y: 2, width: 3, height: 4 },
    };
    expect(changedFields(before, after)).toEqual({ source: 'vector', apBox: after.apBox });
  });

  it('stage keeps the session and appends the changes; a live change makes the record prefer vector', () => {
    const initial = initialAnnotationState();
    const state = stage(initial, initial.session, [edit(1, 'a', { source: 'vector' })]);
    expect(tokens(state)).toEqual([1]);
    expect(state.vector).toEqual({ a: true });
    expect(state.session).toBe(initial.session);
  });

  it('a refused change goes at once, even behind an older one', () => {
    const state = writeSettled(
      withPending([edit(1, 'a', { source: 'vector' }), edit(2, 'a', {})]),
      [2],
      'refused',
    );
    expect(tokens(state)).toEqual([1]);
  });

  it('an accepted change waits for every older change of its record, not of other records', () => {
    let state = withPending([edit(1, 'a', {}), edit(2, 'b', {}), edit(3, 'a', {})]);
    state = writeSettled(state, [3], 'accepted');
    expect(tokens(state)).toEqual([1, 2, 3]); // 3 waits for 1
    state = writeSettled(state, [2], 'accepted');
    expect(tokens(state)).toEqual([1, 3]); // 2 had nothing older on its record
    state = writeSettled(state, [1], 'refused');
    expect(tokens(state)).toEqual([]); // 1 gone, so 3 is released
  });

  it('followRecord moves changes, the vector preference and the text range; answers follow', () => {
    const REF = { kind: 'objectNumber', page: PAGE, objectNumber: 9 } as const;
    const primary = record('s-1');
    const member = record('s-2', { to: named('s-1'), type: 'group' });
    const state = followRecord(
      {
        ...withPending([
          { token: 1, id: primary.id, change: { kind: 'create', record: primary } },
          { token: 2, id: member.id, change: { kind: 'create', record: member } },
          edit(3, primary.id, { source: 'vector' }),
          {
            token: 4,
            id: 'obj:5',
            change: {
              kind: 'edit',
              patch: { subtype: 'square', reply: { to: named('s-1'), type: 'group' } },
              fields: {},
            },
          },
        ]),
        vector: { [primary.id]: true },
        textSelection: { id: primary.id, start: 0, end: 2 },
      },
      primary.id,
      'obj:9',
      REF,
    );
    expect(state.pending.map((change) => [change.token, change.id])).toEqual([
      [1, 'obj:9'],
      [2, member.id],
      [3, 'obj:9'],
      [4, 'obj:5'],
    ]);
    // The create stays until its write settles, under the confirmed key and ref.
    const created = state.pending[0]!.change;
    expect(created.kind === 'create' && [created.record.id, refOf(created.record)]).toEqual([
      'obj:9',
      REF,
    ]);
    // What answered the new record answers it by its engine ref now.
    const answer = state.pending[1]!.change;
    expect(answer.kind === 'create' && groupOf(answer.record.annotation)).toBe('obj:9');
    const regroup = state.pending[3]!.change;
    expect(regroup.kind === 'edit' && regroup.patch).toMatchObject({ reply: { to: REF } });
    expect(state.vector).toEqual({ 'obj:9': true });
    expect(state.textSelection).toEqual({ id: 'obj:9', start: 0, end: 2 });
  });

  it('followRecord leaves a state with nothing of the record alone', () => {
    const state = withPending([edit(1, 'a', {})]);
    const REF = { kind: 'objectNumber', page: PAGE, objectNumber: 3 } as const;
    expect(followRecord(state, 'b', 'obj:3', REF)).toBe(state);
  });
});
