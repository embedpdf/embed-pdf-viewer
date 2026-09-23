import { DRAWN_FLAGS, initialSession, type ModelAnnotation } from '@embedpdf/core-annotation';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CHROME,
  changedFields,
  followRecord,
  initialAnnotationState,
  patchChrome,
  stage,
  writeSettled,
  type AnnotationState,
  type PendingChange,
} from '../src/model';

describe('chrome settings state', () => {
  it('registration config deep-merges over DEFAULT_CHROME', () => {
    const state = initialAnnotationState({ chrome: { accent: '#e91e63', knob: { offset: 48 } } });
    expect(state.chrome.accent).toBe('#e91e63');
    expect(state.chrome.knob.offset).toBe(48);
    // Untouched keys survive the merge: a partial patch never drops defaults.
    expect(state.chrome.knob.hitSize).toBe(DEFAULT_CHROME.knob.hitSize);
    expect(state.chrome.guides.enabled).toBe(true);
    expect(state.chrome.outline.style).toBe('solid');
  });

  it('patchChrome changes settings at runtime without touching the session', () => {
    const before = initialAnnotationState();
    const after = patchChrome(before, { guides: { enabled: false }, outline: { style: 'dashed' } });
    expect(after.chrome.guides.enabled).toBe(false);
    expect(after.chrome.guides.axisOpacity).toBe(DEFAULT_CHROME.guides.axisOpacity);
    expect(after.chrome.outline.style).toBe('dashed');
    expect(after.chrome.outline.width).toBe(DEFAULT_CHROME.outline.width);
    expect(after.session).toBe(before.session);
  });
});

describe('pending changes', () => {
  const record = (id: string, extra: Partial<ModelAnnotation> = {}): ModelAnnotation => ({
    id,
    ref: null,
    page: toPageRef(1),
    subtype: 'square',
    geometry: { kind: 'rect', rect: { x: 0, y: 0, width: 10, height: 10 }, ellipse: false },
    style: initialSession.style,
    flags: DRAWN_FLAGS,
    source: 'baked',
    ...extra,
  });
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

  it('changedFields holds exactly the fields a message changed', () => {
    const before = record('a');
    const after = { ...before, flags: { ...before.flags, locked: true } };
    expect(changedFields(before, after)).toEqual({ flags: after.flags });
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
      withPending([edit(1, 'a', { flags: DRAWN_FLAGS }), edit(2, 'a', {})]),
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

  it('followRecord moves changes and the vector preference; a create goes; pointers follow', () => {
    const state = followRecord(
      {
        ...withPending([
          { token: 1, id: 'new:1', change: { kind: 'create', record: record('new:1') } },
          {
            token: 2,
            id: 'new:2',
            change: { kind: 'create', record: record('new:2', { group: 'new:1' }) },
          },
          edit(3, 'new:1', { flags: DRAWN_FLAGS }),
        ]),
        vector: { 'new:1': true },
      },
      'new:1',
      'obj:9',
    );
    expect(state.pending.map((change) => [change.token, change.id])).toEqual([
      [2, 'new:2'],
      [3, 'obj:9'],
    ]);
    const member = state.pending[0]!.change;
    expect(member.kind === 'create' && member.record.group).toBe('obj:9');
    expect(state.vector).toEqual({ 'obj:9': true });
  });
});
