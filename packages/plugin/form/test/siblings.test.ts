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

/** The tags of the tools the tests use, as the built-in tools and the form's own carry them. */
const TOOL_TAGS: Record<string, readonly string[]> = {
  pointer: ['text-select', 'annotation-edit', 'annotation-marquee', 'form-fill', 'link-nav'],
  'form-edit': ['annotation-edit', 'annotation-marquee', 'form-design'],
  'form-text': ['form-place', 'annotation-edit', 'form-design'],
  stamp: ['annotation-place', 'annotation-edit'],
  ink: ['annotation-draw', 'annotation-edit'],
  zoom: ['zoom-box'],
};

/**
 * A form context with an interaction hub whose active tool is `tool.id`, the annotation plugin
 * when `there`, and the right to design while `mayDesign`.
 */
function contextWith(
  annotation: { there: boolean },
  tool: { id: string } = { id: 'form-edit' },
  rights: { mayDesign: boolean } = { mayDesign: true },
): FormContext {
  const interaction = {
    activeToolEnables: (tag: string) => (TOOL_TAGS[tool.id] ?? []).includes(tag),
  };
  return {
    tryGet: (token: unknown) =>
      token === InteractionToken ? interaction : annotation.there ? { annotation: true } : null,
    allows: (permission: string) => permission !== 'doc.forms.modify' || rights.mayDesign,
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

/**
 * What the form layer does by the active tool: design mode is the form's own tools only, so a
 * stamp, a pen or zoom never turns the form into boxes to select, whatever the session may do.
 */
describe('the form layer mode', () => {
  const modeUnder = (
    toolId: string,
    { there = true, mayDesign = true }: { there?: boolean; mayDesign?: boolean } = {},
  ) => {
    const ctx = contextWith({ there }, { id: toolId }, { mayDesign });
    const design = createDesign(ctx, resolveSiblings(ctx));
    return { mode: design.mode(), lending: design.lending() };
  };

  it('fills under a tool that fills forms', () => {
    expect(modeUnder('pointer')).toEqual({ mode: 'fill', lending: false });
  });

  it("designs under the form's own tools, for a session that may design", () => {
    expect(modeUnder('form-edit')).toEqual({ mode: 'design', lending: true });
    expect(modeUnder('form-text')).toEqual({ mode: 'design', lending: true });
  });

  it('shows the fields, lending nothing, under any other tool, whoever may design', () => {
    for (const tool of ['stamp', 'ink', 'zoom']) {
      expect(modeUnder(tool), tool).toEqual({ mode: 'show', lending: false });
    }
  });

  it("shows the fields under the form's own tools when nothing can be lent", () => {
    expect(modeUnder('form-edit', { mayDesign: false })).toEqual({ mode: 'show', lending: false });
    expect(modeUnder('form-edit', { there: false })).toEqual({ mode: 'show', lending: false });
  });
});
