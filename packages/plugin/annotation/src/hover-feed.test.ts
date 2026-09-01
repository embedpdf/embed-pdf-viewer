import { describe, expect, it } from 'vitest';

import type { Annot } from '@embedpdf/core-annotation';
import type { ActionsCapability, ActionTrigger } from '@embedpdf/plugin-actions';

import { createAnnotationHoverFeed } from './hover-feed';

const tree = { root: { type: 'named', subtype: 'Named', name: 'x', next: [] }, incomplete: false, warningFlags: 0, warnings: [] };

const annot = (id: string, over: Partial<Annot> = {}): Annot =>
  ({
    id,
    ref: { kind: 'objectNumber', pageObjectNumber: 7, annotObjectNumber: Number(id.slice(4)) },
    pon: 7,
    subtype: 'square',
    ...over,
  }) as unknown as Annot;

function harness(annots: Record<string, Annot>) {
  const submitted: string[] = [];
  const actions = {
    dispatch: (trigger: ActionTrigger) => {
      if (trigger.scope === 'annotation') {
        const n = trigger.ref.kind === 'objectNumber' ? trigger.ref.annotObjectNumber : -1;
        submitted.push(`${trigger.event === 'cursorEnter' ? 'E' : 'X'}:${n}`);
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
    const h = harness({
      'obj:1': annot('obj:1', {
        data: { actions: { cursorEnter: tree, cursorExit: tree } },
      } as unknown as Partial<Annot>),
    });
    h.feed.hover('obj:1');
    await settle();
    h.feed.hover(null);
    await settle();
    expect(h.submitted).toEqual(['E:1', 'X:1']);
  });

  it('never dispatches for tree-less, draft, widget, or link annotations', async () => {
    const h = harness({
      'obj:1': annot('obj:1'), // no trees
      draft: annot('draft', { ref: null } as unknown as Partial<Annot>),
      'obj:3': annot('obj:3', {
        subtype: 'widget',
        data: { actions: { cursorEnter: tree } },
      } as unknown as Partial<Annot>),
      'obj:4': annot('obj:4', {
        subtype: 'link',
        data: { actions: { cursorEnter: tree } },
      } as unknown as Partial<Annot>),
    });
    for (const id of ['obj:1', 'draft', 'obj:3', 'obj:4', null]) {
      h.feed.hover(id);
      await settle();
    }
    expect(h.submitted).toEqual([]);
  });

  it('flags a lone /E or /X so the inert half never dispatches', async () => {
    const h = harness({
      'obj:1': annot('obj:1', {
        data: { actions: { cursorEnter: tree } }, // enter only
      } as unknown as Partial<Annot>),
      'obj:2': annot('obj:2', {
        data: { actions: { cursorExit: tree } }, // exit only
      } as unknown as Partial<Annot>),
    });
    h.feed.hover('obj:1');
    await settle();
    h.feed.hover('obj:2');
    await settle();
    h.feed.hover(null);
    await settle();
    expect(h.submitted).toEqual(['E:1', 'X:2']); // no X:1, no E:2
  });
});
