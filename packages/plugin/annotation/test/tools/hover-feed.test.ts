import type { ModelAnnotation } from '@embedpdf/core-annotation';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { ActionsCapability, ActionTrigger } from '@embedpdf/plugin-actions';
import { describe, expect, it } from 'vitest';

import { createAnnotationHoverFeed } from '../../src/tools/hover-feed';

const tree = {
  root: { type: 'named', subtype: 'Named', name: 'x', next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
};

/** The record `obj:<n>`: a square unless `over` (its annotation's fields) says otherwise. */
const annotation = (
  id: string,
  over: Record<string, unknown> = {},
  record: Partial<ModelAnnotation> = {},
): ModelAnnotation =>
  ({
    id,
    source: 'baked',
    annotation: {
      ref: { kind: 'objectNumber', page: toPageRef(7), annotObjectNumber: Number(id.slice(4)) },
      page: toPageRef(7),
      subtype: 'square',
      ...over,
    },
    ...record,
  }) as unknown as ModelAnnotation;

function createHarness(annots: Record<string, ModelAnnotation>) {
  const submitted: string[] = [];
  const actions = {
    dispatch: (trigger: ActionTrigger) => {
      if (trigger.scope === 'annotation') {
        const objectNumber =
          trigger.ref.kind === 'objectNumber' ? trigger.ref.annotObjectNumber : -1;
        submitted.push(`${trigger.event === 'cursorEnter' ? 'E' : 'X'}:${objectNumber}`);
      }
      return Promise.resolve({ status: 'executed' as const, steps: [], diagnostics: [] });
    },
  } as unknown as ActionsCapability;
  const feed = createAnnotationHoverFeed(actions, (id) => annots[id] ?? null);
  return { feed, submitted };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('annotation hover feed', () => {
  it('dispatches E on enter and X on leave for a tree-bearing annotation', async () => {
    const harness = createHarness({
      'obj:1': annotation('obj:1', { actions: { cursorEnter: tree, cursorExit: tree } }),
    });
    harness.feed.hover('obj:1');
    await settle();
    harness.feed.hover(null);
    await settle();
    expect(harness.submitted).toEqual(['E:1', 'X:1']);
  });

  it('never dispatches for tree-less, draft, widget, or link annotations', async () => {
    const harness = createHarness({
      'obj:1': annotation('obj:1'), // no trees
      draft: annotation('draft', { actions: { cursorEnter: tree } }, { unconfirmed: true }),
      'obj:3': annotation('obj:3', {
        subtype: 'widget',
        fieldFamily: 'text',
        actions: { cursorEnter: tree },
      }),
      'obj:4': annotation('obj:4', { subtype: 'link', actions: { cursorEnter: tree } }),
    });
    for (const id of ['obj:1', 'draft', 'obj:3', 'obj:4', null]) {
      harness.feed.hover(id);
      await settle();
    }
    expect(harness.submitted).toEqual([]);
  });

  it('flags a lone /E or /X so the inert half never dispatches', async () => {
    const harness = createHarness({
      'obj:1': annotation('obj:1', { actions: { cursorEnter: tree } }), // enter only
      'obj:2': annotation('obj:2', { actions: { cursorExit: tree } }), // exit only
    });
    harness.feed.hover('obj:1');
    await settle();
    harness.feed.hover('obj:2');
    await settle();
    harness.feed.hover(null);
    await settle();
    expect(harness.submitted).toEqual(['E:1', 'X:2']); // no X:1, no E:2
  });
});
