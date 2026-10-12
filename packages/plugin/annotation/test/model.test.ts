import { initialSession } from '@embedpdf/core-annotation';
import { describe, expect, it } from 'vitest';

import {
  initialAnnotationState,
  preferBaked,
  withObjectNumbers,
  withoutObjectNumbers,
  withSession,
} from '../src/model';

describe('the session and render preferences', () => {
  it('a message that changes nothing leaves the state alone', () => {
    const state = initialAnnotationState();
    expect(withSession(state, state.session)).toBe(state);
    expect(withSession(state, { ...state.session })).toBe(state);
  });

  it('records a message drew live render live from then on, until another session hands them back', () => {
    const state = withSession(initialAnnotationState(), initialSession, ['obj:1', 'obj:2']);
    expect(state.vector).toEqual({ 'obj:1': true, 'obj:2': true });
    // Already live: nothing changes.
    expect(withSession(state, state.session, ['obj:1'])).toBe(state);
    expect(preferBaked(state, ['obj:1']).vector).toEqual({ 'obj:2': true });
  });

  it('holds the object numbers it is handed, and lets go of the ones the engine reclaimed', () => {
    const state = withObjectNumbers(initialAnnotationState(), [900, 901, 902]);
    expect(state.session.objectNumbers).toEqual([900, 901, 902]);
    expect(withObjectNumbers(state, [])).toBe(state);
    expect(withoutObjectNumbers(state, [901, 7]).session.objectNumbers).toEqual([900, 902]);
    expect(withoutObjectNumbers(state, [7])).toBe(state);
  });
});
