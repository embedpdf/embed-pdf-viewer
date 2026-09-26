import { describe, expect, it } from 'vitest';

import { activateTool, initialInteractionState, popTool, pushTool, setCursor } from '../src/model';

describe('interaction transitions', () => {
  it('starts on the configured default tool', () => {
    expect(initialInteractionState({ defaultTool: 'pan' })).toEqual({
      activeToolId: 'pan',
      defaultToolId: 'pan',
      toolStack: [],
      cursor: 'default',
    });
  });

  it('activates a tool and clears the stack, returning the same state when already armed', () => {
    const state = initialInteractionState({});
    expect(activateTool(state, 'pointer')).toBe(state);
    const pushed = pushTool(state, 'pan');
    expect(activateTool(pushed, 'pan')).toEqual({ ...state, activeToolId: 'pan', toolStack: [] });
  });

  it('pushes and pops tools in order, and an empty stack pops nothing', () => {
    const state = initialInteractionState({});
    const pushed = pushTool(pushTool(state, 'pan'), 'ink');
    expect(pushed.toolStack).toEqual(['pointer', 'pan']);
    expect(pushed.activeToolId).toBe('ink');
    const popped = popTool(pushed);
    expect(popped.activeToolId).toBe('pan');
    const emptied = popTool(popped);
    expect(emptied.activeToolId).toBe('pointer');
    expect(popTool(emptied)).toBe(emptied);
  });

  it('sets the cursor, returning the same state for the same cursor', () => {
    const state = initialInteractionState({});
    expect(setCursor(state, 'default')).toBe(state);
    expect(setCursor(state, 'grab').cursor).toBe('grab');
  });
});
