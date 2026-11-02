/**
 * The tile plane and its tiles. The plane holds the view's handle while the renderer and the view
 * are the same, holds its page's claim on it while the page is the same, and only sends a new
 * demand when the camera moves; a tile tells its view when its picture is painted and when it
 * goes, the second also as the element is destroyed (an output emitted then would be dropped).
 * The page's picture state: the layer reports its page loading until the base picture is on
 * screen, a painter is handed the report, and `injectPictureState()` reads it back.
 */
import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EPDF_PAGE } from '@embedpdf/angular/runtime';
import { EpdfPageView } from '@embedpdf/angular/page-view';
import { EpdfRenderLayer, injectPictureState } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage, StageToken, withStage } from '@embedpdf/angular/stage';
import { toPageRef, type AnyPlugin, type CapabilityToken, type PageRef } from '@embedpdf/core';
import {
  RenderToken,
  type PicturePainter,
  type PictureReport,
  type PictureState,
} from '@embedpdf/plugin-render';
import type {
  RenderHostCapability,
  TilePaintPlan,
  TilePaintSource,
  ViewDemand,
} from '@embedpdf/plugin-render/contract/host';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { EpdfTileImage } from '../render/src/render-layer';
import { bytesInput, fakeEngine, kernelOf, mount, viewerHost } from './fixtures';

const measured = ['clientWidth', 'clientHeight'] as const;
const originals = measured.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600,
  });
});
afterAll(() => {
  measured.forEach((name, index) => {
    const original = originals[index];
    if (original) Object.defineProperty(HTMLElement.prototype, name, original);
  });
});
afterEach(() => TestBed.resetTestingModule());

const tile = {
  key: 'tile-1',
  scale: 2,
  rect: { x: 0, y: 0, width: 100, height: 100 },
  z: 1,
  handle: {
    objectUrl: vi.fn(() =>
      Object.assign(Promise.resolve({ url: 'blob:tile-1', revoke: () => {} }), {
        abortWith: () => Promise.resolve({ url: 'blob:tile-1', revoke: () => {} }),
      }),
    ),
  },
} as unknown as TilePaintSource;

const IDLE: PictureState = { status: 'idle', slow: false };

/** A render plugin whose view's handle records what the tile plane does with it. */
function fakeRender() {
  /** Every demand the plane sends: the page and how wide it wants it. */
  const demands: { page: number; width: number; visible?: string }[] = [];
  let plan: TilePaintPlan = { engaged: true, paint: [tile], fetching: [], stamp: 'one' };
  /** Plan again: the same tile, with the same picture, as a new object (as the plugin hands it). */
  const replan = () => {
    plan = { ...plan, paint: plan.paint.map((source) => ({ ...source })) };
  };
  const view: ViewDemand = {
    setDemand: (page, demand) =>
      demands.push({
        page: page.objectNumber,
        width: demand.desiredDeviceWidth,
        visible: demand.visibleRect && JSON.stringify(demand.visibleRect),
      }),
    getPlan: () => plan, // the same plan until it changes, as the plugin's
    markPainted: () => {},
    markUnpainted: () => {},
    release: vi.fn(),
    dispose: vi.fn(),
  };
  const createViewDemand = vi.fn(() => view);
  const paint = { tiles: true };
  let painter: PicturePainter | null = null;
  let notify = () => {};
  /** Every report a layer opened: on which page and view, and what it said. */
  const reports: {
    view: string;
    page: number;
    shown: number;
    failed: unknown[];
    closed: boolean;
  }[] = [];
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
  const task = <T>(value: T) =>
    Object.assign(Promise.resolve(value), { abortWith: () => Promise.resolve(value) });
  const api = {
    getPicturePainter: () => painter,
    getPaintSettings: () => paint,
    getLayerRights: () => ({ annotations: true, formFields: true }),
    getSourceKey: (page: PageRef) => `page-${page.objectNumber}`,
    renderSource: (page: PageRef) =>
      failure
        ? Promise.reject(failure)
        : Promise.resolve({
            objectUrl: () => task({ url: `blob:page-${page.objectNumber}`, revoke: () => {} }),
          }),
    createViewDemand,
    reportPicture: (view: string, page: PageRef) => {
      const entry = {
        view,
        page: page.objectNumber,
        shown: 0,
        failed: [] as unknown[],
        closed: false,
      };
      reports.push(entry);
      return {
        shown: () => void (entry.shown += 1),
        failed: (error: unknown) => void entry.failed.push(error),
        close: () => void (entry.closed = true),
      };
    },
    getPictureState: (page: PageRef, view: string) =>
      states.get(`${view}:${page.objectNumber}`) ?? IDLE, // the same object while the same, as the plugin's
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
    feature: { plugins: [plugin], services: [] },
    demands,
    view,
    createViewDemand,
    replan,
    pictureAsks,
    handOver,
    reports,
    failWith,
    setPictureState,
  };
}

const tiles = (root: HTMLElement) => root.querySelectorAll('epdf-tile-plane img');

describe('the tile plane', () => {
  it('follows a zoom and a scroll with new demands, keeping the page and the view', async () => {
    const render = fakeRender();
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
        config: { engine: fakeEngine(1).engine },
        features: [withStage(), render.feature],
        template: `
          <epdf-stage>
            <ng-template epdfPage><epdf-render-layer /></ng-template>
          </epdf-stage>
        `,
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(tiles(fixture.nativeElement)).toHaveLength(1);
    });
    const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
    const sent = render.demands.length;
    const before = render.demands.at(-1)!;

    stage.zoomTo(4);
    await fixture.whenStable();
    stage.scrollBy({ top: 600, behavior: 'instant' });
    await fixture.whenStable();

    const after = render.demands.slice(sent);
    expect(after.at(-1)!.width).toBeGreaterThan(before.width); // the zoom asked for more pixels
    expect(new Set(after.map((demand) => demand.visible)).size).toBeGreaterThan(1); // the scroll moved the visible part
    expect(render.view.release).not.toHaveBeenCalled();
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(tiles(fixture.nativeElement)).toHaveLength(1);
  });

  it('binds a tile once while a re-plan keeps it (the same picture, a new plan object)', async () => {
    const render = fakeRender();
    const fixture = await mount(
      viewerHost({
        imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
        config: { engine: fakeEngine(1).engine },
        features: [withStage(), render.feature],
        template: `
          <epdf-stage>
            <ng-template epdfPage><epdf-render-layer /></ng-template>
          </epdf-stage>
        `,
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(tiles(fixture.nativeElement)).toHaveLength(1);
    });
    const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
    const asked = render.pictureAsks();

    for (let step = 0; step < 3; step++) {
      render.replan();
      stage.scrollBy({ top: 40, behavior: 'instant' });
      await fixture.whenStable();
    }

    expect(render.pictureAsks()).toBe(asked); // not bound again, so never hidden to reload
    expect(tiles(fixture.nativeElement)).toHaveLength(1);
  });

  it('in a page view given another page, lets go of the old page and plans the new one', async () => {
    @Component({
      selector: 'test-picker',
      imports: [EpdfPageView, EpdfRenderLayer],
      template: `
        @if (shown()) {
          <epdf-page-view [page]="index()" [width]="300"><epdf-render-layer /></epdf-page-view>
        }
      `,
    })
    class Picker {
      readonly index = signal(0);
      readonly shown = signal(true);
    }
    const render = fakeRender();
    const fixture = await mount(
      viewerHost({
        imports: [Picker],
        config: { engine: fakeEngine(2).engine },
        features: [render.feature],
        template: '<test-picker />',
      }),
    );
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(tiles(fixture.nativeElement)).toHaveLength(1);
    });
    expect(render.demands.at(-1)!.page).toBe(1);
    const picker = fixture.debugElement.children[0]!.componentInstance as Picker;

    picker.index.set(1);
    await fixture.whenStable();

    expect(render.view.release).toHaveBeenCalledTimes(1);
    expect(render.view.release).toHaveBeenCalledWith(toPageRef(1));
    expect(render.demands.at(-1)!.page).toBe(2);
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(tiles(fixture.nativeElement)).toHaveLength(1);

    // When it goes, it lets go of the page it shows now, and of the view.
    picker.shown.set(false);
    await fixture.whenStable();
    expect(render.view.release).toHaveBeenLastCalledWith(toPageRef(2));
    expect(render.view.dispose).toHaveBeenCalledTimes(1);
  });
});

@Component({
  imports: [EpdfTileImage],
  providers: [{ provide: EPDF_PAGE, useValue: { ref: toPageRef(1) } }],
  template: `
    @if (shown()) {
      <img alt="" [epdfTile]="tile" [epdfTileView]="view" />
    }
  `,
})
class TileHost {
  readonly shown = signal(true);
  readonly tile = tile;
  readonly view = { markPainted: vi.fn(), markUnpainted: vi.fn() } as unknown as ViewDemand;
}

describe('a tile', () => {
  it('tells its view it is painted, and unpainted when its element goes', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TileHost);
    await fixture.whenStable();
    const view = fixture.componentInstance.view;
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    image.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(view.markPainted).toHaveBeenCalledWith(toPageRef(1), 'tile-1'));

    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    expect(view.markUnpainted).toHaveBeenCalledWith(toPageRef(1), 'tile-1');
  });
});

/** The page's state as text: `loading slow`, `ready`, … */
@Component({
  selector: 'test-picture-state',
  template: `{{ picture().status }}{{ picture().slow ? ' slow' : '' }}`,
})
class PictureStateProbe {
  protected readonly picture = injectPictureState();
}

/** One page in a page view, with its state shown when `probe`; `shown` takes the page away. */
@Component({
  selector: 'test-one-page',
  imports: [EpdfPageView, EpdfRenderLayer, PictureStateProbe],
  template: `
    @if (shown()) {
      <epdf-page-view [page]="0" [width]="300">
        <epdf-render-layer />
        @if (probe()) {
          <test-picture-state />
        }
      </epdf-page-view>
    }
  `,
})
class OnePage {
  readonly probe = input(false);
  readonly shown = signal(true);
}

/** The page's whole-page picture: the layer's own <img>, the one tiles sit over. */
const basePicture = (root: HTMLElement) =>
  root.querySelector('epdf-render-layer > img') as HTMLImageElement | null;

async function onePage(render: ReturnType<typeof fakeRender>, probe = false) {
  const fixture = await mount(
    viewerHost({
      imports: [OnePage],
      config: { engine: fakeEngine(1).engine },
      features: [render.feature],
      template: `<test-one-page [probe]="${probe}" />`,
    }),
  );
  await kernelOf(fixture).documents.open(bytesInput('a'));
  const page = fixture.debugElement.children[0]!.componentInstance as OnePage;
  return { fixture, page };
}

describe("the page's picture state", () => {
  it('reports the page loading in its view until the base picture presented, and closes with the layer', async () => {
    const render = fakeRender();
    const { fixture, page } = await onePage(render);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(basePicture(fixture.nativeElement)?.getAttribute('src')).toBe('blob:page-1');
    });
    expect(render.reports).toHaveLength(1);
    const report = render.reports[0]!;
    expect(report.page).toBe(1);
    expect(report.shown).toBe(0); // not loaded yet

    basePicture(fixture.nativeElement)!.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(report.shown).toBe(1)); // after a frame presented it

    page.shown.set(false);
    await fixture.whenStable();
    expect(report.closed).toBe(true);
  });

  it('reports a render that fails', async () => {
    const render = fakeRender();
    const refused = new Error('refused');
    render.failWith(refused);
    const { fixture } = await onePage(render);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(render.reports[0]?.failed).toEqual([refused]);
    });
    expect(render.reports[0]!.shown).toBe(0);
  });

  it("hands a painter the page's report, and closes it when the painter is given back", async () => {
    const render = fakeRender();
    const { fixture } = await onePage(render);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(render.reports).toHaveLength(1);
    });
    const handed: PictureReport[] = [];
    render.handOver({
      paints: () => true,
      paint: (_host, _page, report) => {
        handed.push(report);
        return { update: () => {}, destroy: () => {} };
      },
    });
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(handed).toHaveLength(1);
    });
    expect(render.reports[0]!.closed).toBe(true); // the base went, and its report with it
    const report = render.reports.find((entry) => !entry.closed)!;

    handed[0]!.shown();
    expect(report.shown).toBe(1);

    render.handOver(null);
    await fixture.whenStable();
    expect(report.closed).toBe(true);
  });

  it('reads the state of the page it is drawn on, in its view', async () => {
    const render = fakeRender();
    const { fixture } = await onePage(render, true);
    const probe = () => fixture.nativeElement.querySelector('test-picture-state')?.textContent;
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(probe()).toBe('idle');
      expect(render.reports).toHaveLength(1);
    });
    const view = render.reports[0]!.view;

    render.setPictureState(view, 1, { status: 'loading', slow: true });
    await fixture.whenStable();
    expect(probe()).toBe('loading slow');
    render.setPictureState('another view', 1, { status: 'ready', slow: false });
    await fixture.whenStable();
    expect(probe()).toBe('loading slow');
  });
});
