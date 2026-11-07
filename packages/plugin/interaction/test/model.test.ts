import { describe, expect, it } from 'vitest';

import {
  activateTool,
  builtinTools,
  initialInteractionModel,
  popTool,
  pushTool,
  setCursor,
} from '../src/model';

describe('interaction transitions', () => {
  it('starts on the pointer tool', () => {
    expect(initialInteractionModel()).toEqual({
      activeToolId: 'pointer',
      toolStack: [],
      cursor: 'default',
    });
  });

  it('activates a tool and clears the stack, returning the same state when already armed', () => {
    const state = initialInteractionModel();
    expect(activateTool(state, 'pointer')).toBe(state);
    const pushed = pushTool(state, 'pan');
    expect(activateTool(pushed, 'pan')).toEqual({ ...state, activeToolId: 'pan', toolStack: [] });
  });

  it('pushes and pops tools in order, and an empty stack pops nothing', () => {
    const state = initialInteractionModel();
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
    const state = initialInteractionModel();
    expect(setCursor(state, 'default')).toBe(state);
    expect(setCursor(state, 'grab').cursor).toBe('grab');
  });
});

describe('the built-in tools', () => {
  it('are pointer, pan and zoom', () => {
    expect(builtinTools().map((tool) => tool.id)).toEqual(['pointer', 'pan', 'zoom']);
  });

  it('zoom draws its box anywhere, with one finger on touch, and a click zooms instead of following links or filling forms', () => {
    const zoom = builtinTools().find((tool) => tool.id === 'zoom')!;
    expect(zoom).toMatchObject({ cursor: 'zoom-in', gapCursor: 'zoom-in', touch: 'draw' });
    expect([...zoom.enables]).toEqual(['zoom-box']);
  });
});
