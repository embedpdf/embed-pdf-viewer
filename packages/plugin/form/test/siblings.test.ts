/**
 * The form plugin looks its siblings up when it uses them, not once as it's created: design
 * mode lends the widgets while the annotation plugin is there now, whether or not it was there
 * when the form plugin was made (it isn't when something builds the form plugin while the
 * annotation plugin is still being created).
 */
import { describe, expect, it } from 'vitest';

import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import type { FormContext } from '../src/services/context';
import { createDesign } from '../src/services/design';
import { resolveSiblings } from '../src/services/siblings';

/** A form context with an interaction hub whose tool designs, and the annotation plugin when `there`. */
function contextWith(annotation: { there: boolean }): FormContext {
  const interaction = { getActiveTool: () => ({ id: 'form-edit', enables: new Set<string>() }) };
  return {
    tryGet: (token: unknown) =>
      token === InteractionToken ? interaction : annotation.there ? { annotation: true } : null,
    allows: () => true,
  } as unknown as FormContext;
}

describe('the form plugin siblings', () => {
  it('are looked up on use: design mode lends once the annotation plugin is there', () => {
    const annotation = { there: false };
    const ctx = contextWith(annotation);
    const siblings = resolveSiblings(ctx);
    const design = createDesign(ctx, siblings);
    expect(siblings.annotation()).toBeNull();
    expect(design.lending()).toBe(false);

    annotation.there = true;
    expect(siblings.annotation()).toEqual({ annotation: true });
    expect(design.lending()).toBe(true);
  });
});
