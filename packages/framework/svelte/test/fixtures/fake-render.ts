/**
 * A render plugin of a test's own: every page gets a picture named after its source key and a
 * one-tile plan, and the view's handle records what the tile plane does with it. It records the
 * reports the layers open on their pages, and answers the picture states a test sets.
 */
import { vi } from 'vitest';
import type { AnyPlugin, PageRef } from '@embedpdf/core';
import { RenderToken, type PicturePainter, type PictureState } from '@embedpdf/plugin-render';
import type {
  RenderHostCapability,
  TilePaintPlan,
  ViewDemand,
} from '@embedpdf/plugin-render/contract/host';

const tile = {
  key: 'tile-1',
  scale: 2,
  rect: { x: 0, y: 0, width: 100, height: 100 },
  z: 1,
  handle: {
    objectUrl: vi.fn(() => ({
      abortWith: () => Promise.resolve({ url: 'blob:tile-1', revoke: () => {} }),
    })),
  } as never,
};

const task = <T>(value: T) => Object.assign(Promise.resolve(value), { abortWith: () => Promise.resolve(value) });

const IDLE: PictureState = Object.freeze({ status: 'idle', slow: false });

/** A report a layer opened: on which page and view, and what it said. */
export interface OpenedReport {
  view: string;
  page: number;
  shown: number;
  failed: unknown[];
  closed: boolean;
}

export function fakeRender() {
  /** Every demand the plane sends: the page, how wide it wants it, and the parts it draws. */
  const demands: { page: number; width: number; visible?: string; parts?: object }[] = [];
  let plan: TilePaintPlan = { engaged: true, paint: [tile], fetching: [], stamp: 'one' };
  /** Plan again: the same tile, with the same picture, as a new object (as the plugin hands it). */
  const replan = () => {
    plan = { ...plan, paint: plan.paint.map((source) => ({ ...source })) };
  };
  const view: ViewDemand = {
    setDemand: (page, demand, parts) =>
      demands.push({
        page: page.objectNumber,
        width: demand.desiredDeviceWidth,
        visible: demand.visibleRect && JSON.stringify(demand.visibleRect),
        parts,
      }),
    getPlan: () => plan, // the same plan until it changes, as the plugin's
    markPainted: () => {},
    markUnpainted: () => {},
    release: vi.fn(),
    dispose: vi.fn(),
  };
  const createViewDemand = vi.fn(() => view);
  const paint = { tiles: true };
  const rights = { annotations: true, formFields: true };
  const keyOf = (page: PageRef) => `page-${page.objectNumber}`;
  let painter: PicturePainter | null = null;
  let notify = () => {};
  /** Every report a layer opened, in order. */
  const reports: OpenedReport[] = [];
  /** Make every whole-page render fail with this, or succeed again with `null`. */
  let failure: unknown = null;
  const failWith = (error: unknown) => {
    failure = error;
  };
  /** The picture states the fake answers, by `view:page`. */
  const states = new Map<string, PictureState>();
  const setPictureState = (view: string, page: number, state: PictureState) => {
    states.set(`${view}:${page}`, state);
    notify();
  };
  /** Hand the pictures to a painter, as `handOverPictures` does; `null` gives them back. */
  const handOver = (next: PicturePainter | null) => {
    painter = next;
    notify();
  };
  /** How often a whole-page picture was asked for. */
  const sourceAsks = { count: 0 };
  const api = {
    getPicturePainter: () => painter,
    getPaintSettings: () => paint,
    getLayerRights: () => rights,
    getSourceKey: (page: PageRef) => keyOf(page),
    renderSource: (page: PageRef) => {
      sourceAsks.count += 1;
      return failure
        ? Promise.reject(failure)
        : Promise.resolve({
            objectUrl: () => task({ url: `blob:${keyOf(page)}`, revoke: () => {} }),
          });
    },
    createViewDemand,
    reportPicture: (view: string, page: PageRef) => {
      const entry: OpenedReport = {
        view,
        page: page.objectNumber,
        shown: 0,
        failed: [],
        closed: false,
      };
      reports.push(entry);
      return {
        shown: () => void (entry.shown += 1),
        failed: (error: unknown) => void entry.failed.push(error),
        close: () => void (entry.closed = true),
      };
    },
    // The same object while the state is the same, as the plugin's: a reader reads it again on
    // every change.
    getPictureState: (page: PageRef, view: string) =>
      states.get(`${view}:${page.objectNumber}`) ?? IDLE,
  } as unknown as RenderHostCapability;
  const plugin: AnyPlugin = {
    id: 'render',
    scope: 'document',
    token: RenderToken,
    create: (ctx) => {
      notify = () => ctx.notify();
      return { api };
    },
  };
  /** How often the tile's picture has been asked for: once per binding. */
  const pictureAsks = () =>
    (tile.handle as unknown as { objectUrl: { mock: { calls: unknown[] } } }).objectUrl.mock.calls.length;
  return {
    plugin,
    demands,
    view,
    createViewDemand,
    replan,
    pictureAsks,
    handOver,
    reports,
    failWith,
    setPictureState,
    sourceAsks,
  };
}
