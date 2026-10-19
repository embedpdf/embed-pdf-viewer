/**
 * The outline's neighbours, faked: following an item (its /A through the
 * actions plugin, its target through the link plugin or the stage), the item
 * for the reading position, and what a new item takes when the caller leaves
 * things out (the place in view, the selected text, the language's word).
 */
import type { DocumentHandle, PageDestination } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import {
  actionTreeOf,
  toOutlineItemRef,
  toPageRef,
  type ChangeOp,
  type OutlineItem,
  type OutlineItemRef,
} from '@embedpdf/engine-core/runtime';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { LinkToken } from '@embedpdf/plugin-link/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { describe, expect, it, vi } from 'vitest';

import { createOutlineController } from '../src/controller';
import { initialOutlineState } from '../src/model';

const FIRST_PAGE = toPageRef(3);
const SECOND_PAGE = toPageRef(4);
const A = toOutlineItemRef(6);
const B = toOutlineItemRef(7);
const C = toOutlineItemRef(8);

const spot = (page = FIRST_PAGE, y = 100): PageDestination => ({
  kind: 'xyz',
  page,
  x: 0,
  y,
  zoom: null,
});
const item = (ref: OutlineItemRef, title: string, extra: Partial<OutlineItem>): OutlineItem => ({
  ref,
  parent: null,
  title,
  target: null,
  action: null,
  open: false,
  color: null,
  bold: false,
  italic: false,
  ...extra,
});

/** A goes to page 3 by an /A GoTo; B to page 4 by a /Dest; C to a website by an /A URI. */
const ITEMS = [
  item(A, 'A', {
    target: { kind: 'goto', destination: spot() },
    action: actionTreeOf({ kind: 'goto', destination: spot() }),
  }),
  item(B, 'B', { target: { kind: 'goto', destination: { kind: 'fit', page: SECOND_PAGE } } }),
  item(C, 'C', {
    target: { kind: 'uri', uri: 'https://example.com/' },
    action: actionTreeOf({ kind: 'uri', uri: 'https://example.com/' }),
  }),
];

async function harness(
  capabilities: ReadonlyArray<readonly [{ readonly name: string }, unknown]> = [],
) {
  const ctx = createTestContext({
    id: 'outline',
    state: initialOutlineState(),
    pages: [
      { ref: FIRST_PAGE, size: { width: 300, height: 300 } },
      { ref: SECOND_PAGE, size: { width: 300, height: 300 } },
    ],
    capabilities: capabilities as never,
    doc: {
      outline: { get: async () => ({ items: ITEMS, incomplete: false }) },
      // Changes stay on their way: these tests read what was staged.
      apply: () => new Promise(() => {}),
      objectNumbers: { take: () => 50, reserve: async () => {}, onLost: () => () => {} },
    } as unknown as Partial<DocumentHandle>,
  });
  const outline = ctx.connect(createOutlineController(ctx));
  await outline.ensureLoaded();
  const staged = (): ChangeOp => ctx.changes.pending()[0]!.shows[0] as ChangeOp;
  return { ctx, outline, staged };
}

const fakeStage = (current: { destination: PageDestination | null }) => ({
  getCurrentDestination: () => current.destination,
  goToDestination: vi.fn(),
});

describe('activate', () => {
  it('runs an /A through the actions plugin, named as the outline item it is', async () => {
    const actions = { execute: vi.fn(() => Promise.resolve({ steps: [] })) };
    const { outline } = await harness([[ActionsToken, actions]]);
    expect(outline.activate(A)).toMatchObject({ outcome: 'dispatched' });
    expect(actions.execute).toHaveBeenCalledWith(ITEMS[0]!.action, {
      origin: 'user',
      source: { kind: 'outline', item: A },
      event: { scope: 'activate' },
    });
  });

  it('follows a target through the link plugin when it is there', async () => {
    const link = { activate: vi.fn(() => ({ outcome: 'uri', uri: 'https://example.com/' })) };
    const { outline } = await harness([[LinkToken, link]]);
    expect(outline.activate(C)).toEqual({ outcome: 'uri', uri: 'https://example.com/' });
    expect(link.activate).toHaveBeenCalledWith(ITEMS[2]!.target);
  });

  it('moves the stage to a destination without the link plugin, and hands on the rest', async () => {
    const stage = fakeStage({ destination: null });
    const { outline } = await harness([[StageToken, stage]]);
    expect(outline.activate(B)).toEqual({ outcome: 'revealed' });
    expect(stage.goToDestination).toHaveBeenCalledWith({ kind: 'fit', page: SECOND_PAGE });
    expect(outline.activate(C)).toEqual({ outcome: 'uri', uri: 'https://example.com/' });
  });

  it('refuses a ref the outline does not have', async () => {
    const { outline } = await harness();
    expect(() => outline.activate(toOutlineItemRef(99))).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    );
  });
});

describe('the reading position', () => {
  it('is the last item at or above the top of the view', async () => {
    const current = { destination: spot(FIRST_PAGE, 50) as PageDestination | null };
    const { outline } = await harness([[StageToken, fakeStage(current)]]);
    expect(outline.getCurrentItem()).toBeNull();
    current.destination = spot(FIRST_PAGE, 200);
    expect(outline.getCurrentItem()).toEqual(A);
    current.destination = spot(SECOND_PAGE, 0);
    expect(outline.getCurrentItem()).toEqual(B);
    current.destination = null;
    expect(outline.getCurrentItem()).toBeNull();
  });

  it('is nothing without a stage', async () => {
    const { outline } = await harness();
    expect(outline.getCurrentItem()).toBeNull();
    expect(outline.getCurrentViewTarget()).toBeNull();
  });
});

describe('what a new item takes', () => {
  it('goes where the view is, titled with the selected text on one line', async () => {
    const stage = fakeStage({ destination: spot(SECOND_PAGE, 120) });
    const selection = { hasSelection: () => true, readText: async () => '  Chapter\n two ' };
    const { outline, staged } = await harness([
      [StageToken, stage],
      [SelectionToken, selection],
    ]);
    void outline.create();
    await vi.waitFor(() => expect(staged()).toBeDefined());
    expect(staged()).toEqual({
      type: 'outline.create',
      parent: null,
      objectNumber: 50,
      data: { title: 'Chapter two', target: { kind: 'goto', destination: spot(SECOND_PAGE, 120) } },
    });
  });

  it('is "Untitled" in the viewer’s language without selected text, and goes nowhere when told', async () => {
    const i18n = {
      t: (_key: string, options?: { fallback?: string }) => `fr:${options?.fallback}`,
    };
    const { outline, staged } = await harness([[I18nToken, i18n]]);
    void outline.create({ target: null, parent: A, position: 'start' });
    await vi.waitFor(() => expect(staged()).toBeDefined());
    expect(staged()).toEqual({
      type: 'outline.create',
      parent: A,
      position: 'start',
      objectNumber: 50,
      data: { title: 'fr:Untitled' },
    });
  });

  it('is "Untitled" without the i18n plugin', async () => {
    const { outline, staged } = await harness();
    void outline.create({ title: undefined });
    await vi.waitFor(() => expect(staged()).toBeDefined());
    expect(staged()).toMatchObject({ data: { title: 'Untitled' } });
  });
});
