import { describe, expect, it } from 'vitest';

import {
  initialStageModel,
  markPlaced,
  patchSettings,
  setActiveRules,
  setCamera,
  setCursor,
  setViewport,
} from '../src/model';

describe('stage transitions', () => {
  it('return the same state when nothing changes', () => {
    const state = initialStageModel({});
    expect(setCamera(state, state.camera)).toBe(state);
    expect(setViewport(state, state.viewport)).toBe(state);
    expect(setCursor(state, state.cursor)).toBe(state);
    expect(setActiveRules(state, state.activeRules)).toBe(state);
    expect(patchSettings(state, { layout: state.layout, padding: undefined })).toBe(state);
  });

  it('keep the render-commit latch one-way', () => {
    const placed = markPlaced(initialStageModel({}));
    expect(placed.placed).toBe(true);
    expect(markPlaced(placed)).toBe(placed);
  });

  it('patch only the defined settings', () => {
    const state = initialStageModel({});
    const next = patchSettings(state, { padding: 8, gap: undefined });
    expect(next).not.toBe(state);
    expect(next.padding).toBe(8);
    expect(next.gap).toBe(state.gap);
  });

  it('strip capability config from the initial settings', () => {
    const state = initialStageModel({ responsive: [] });
    expect('responsive' in state).toBe(false);
  });
});
