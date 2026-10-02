import { describe, expect, it } from 'vitest';

import {
  initialStageState,
  markPlaced,
  patchSettings,
  setActiveRules,
  setCamera,
  setCursor,
  setViewport,
} from '../src/model';

describe('stage transitions', () => {
  it('return the same state when nothing changes', () => {
    const state = initialStageState({});
    expect(setCamera(state, state.camera)).toBe(state);
    expect(setViewport(state, state.viewport)).toBe(state);
    expect(setCursor(state, state.cursor)).toBe(state);
    expect(setActiveRules(state, state.activeRules)).toBe(state);
    expect(patchSettings(state, { layout: state.layout, padding: undefined })).toBe(state);
  });

  it('keep the render-commit latch one-way', () => {
    const placed = markPlaced(initialStageState({}));
    expect(placed.placed).toBe(true);
    expect(markPlaced(placed)).toBe(placed);
  });

  it('patch only the defined settings', () => {
    const state = initialStageState({});
    const next = patchSettings(state, { padding: 8, gap: undefined });
    expect(next).not.toBe(state);
    expect(next.padding).toBe(8);
    expect(next.gap).toBe(state.gap);
  });

  it('strip capability config from the initial settings', () => {
    const state = initialStageState({ responsive: [], scheduler: { raf: () => 0, caf: () => {} } });
    expect('responsive' in state).toBe(false);
    expect('scheduler' in state).toBe(false);
  });
});
