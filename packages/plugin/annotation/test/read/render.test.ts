import { describe, expect, it } from 'vitest';

import { annotationHarness, PAGE } from '../harness';

describe('the tool ghost', () => {
  it.each([
    ['note', 'comment'],
    ['attachment', 'paperclip'],
  ])('the %s tool’s ghost draws the icon it places', (toolId, icon) => {
    const harness = annotationHarness();
    harness.seedToolDefaults();
    harness.capability.hoverGhostAt(toolId, PAGE, { x: 100, y: 100 });
    const ghost = harness.capability.listPageItems(PAGE).find((item) => item.id === 'tool-ghost');
    expect(ghost?.icon).toBe(icon);
  });
});
