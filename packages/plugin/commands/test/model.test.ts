import { describe, expect, it } from 'vitest';

import {
  disableCategory,
  enableCategory,
  initialCommandsState,
  setDisabledCategories,
} from '../src/model';

describe('commands transitions', () => {
  it('seeds the disabled categories from config', () => {
    expect(initialCommandsState(['forms']).disabledCategories).toEqual(['forms']);
    expect(initialCommandsState().disabledCategories).toEqual([]);
  });

  it('disables and enables a category, returning the same state when nothing changes', () => {
    const state = initialCommandsState();
    const disabled = disableCategory(state, 'forms');
    expect(disabled.disabledCategories).toEqual(['forms']);
    expect(disableCategory(disabled, 'forms')).toBe(disabled);
    const enabled = enableCategory(disabled, 'forms');
    expect(enabled.disabledCategories).toEqual([]);
    expect(enableCategory(enabled, 'forms')).toBe(enabled);
  });

  it('replaces the disabled categories, returning the same state for an equal list', () => {
    const state = initialCommandsState(['forms']);
    expect(setDisabledCategories(state, ['forms'])).toBe(state);
    expect(setDisabledCategories(state, ['annotate']).disabledCategories).toEqual(['annotate']);
  });
});
