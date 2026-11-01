/**
 * Fakes for the display: pages with real transforms, a player's screen that records what it's
 * told, frame fetches the test lets through, and a plugin clock over a manual one.
 */
import { pageTransform, type PageRotation } from '@embedpdf/core-geometry';
import { encodePageKey, toPageRef, type PageRef, type PluginClock } from '@embedpdf/core';
import type { ManualClock } from '@embedpdf/core/testing';
import type { PicturePage } from '@embedpdf/plugin-render/contract';
import type { Rect } from '@embedpdf/plugin-stage/contract/host';

import type { FrameLayer, ProtectedScreen } from '../../src/contract';

/** View pixels per point at 100%, as on the web. */
const VIEW_UNITS_PER_POINT = 96 / 72;

/** Page `pageNumber` of a 600 × 800 pt document, at `zoom` on a screen of `dpr`. */
export function pictureOf(
  pageNumber: number,
  {
    zoom = 1,
    rotation = 0,
    dpr = 2,
  }: { zoom?: number; rotation?: PageRotation; dpr?: number } = {},
): PicturePage {
  return {
    ref: toPageRef(pageNumber),
    pageIndex: pageNumber - 1,
    view: 'main',
    transform: pageTransform({
      pageSize: { width: 600, height: 800 },
      rotation,
      scale: VIEW_UNITS_PER_POINT * zoom,
      baseScale: VIEW_UNITS_PER_POINT,
      dpr,
    }),
  };
}

/** What a fake layer was told, in order. */
export type LayerCall =
  | { readonly type: 'load'; readonly key: string }
  | { readonly type: 'show'; readonly key: string }
  | { readonly type: 'hide' }
  | { readonly type: 'place'; readonly rect: Rect | null }
  | { readonly type: 'redraw' }
  | { readonly type: 'forget'; readonly kept: readonly string[] };

export interface FakeLayer extends FrameLayer {
  readonly calls: LayerCall[];
  /** The frame on screen in the layer, shown or not. */
  readonly onScreen: string | null;
  /** Whether the layer shows. */
  readonly visible: boolean;
  readonly loaded: ReadonlySet<string>;
}

function fakeLayer(): FakeLayer {
  const calls: LayerCall[] = [];
  const loaded = new Set<string>();
  let onScreen: string | null = null;
  let visible = false;
  let showing = 0;
  return {
    calls,
    loaded,
    get onScreen() {
      return onScreen;
    },
    get visible() {
      return visible;
    },
    async load(key, frame) {
      calls.push({ type: 'load', key });
      if (loaded.has(key)) return;
      await frame();
      loaded.add(key);
    },
    async show(key) {
      calls.push({ type: 'show', key });
      if (!loaded.has(key)) throw new Error(`${key} was shown before it was loaded`);
      const mine = ++showing;
      await Promise.resolve();
      onScreen = key;
      if (mine === showing) visible = true;
    },
    hide() {
      calls.push({ type: 'hide' });
      showing++;
      visible = false;
    },
    place(rect) {
      calls.push({ type: 'place', rect });
    },
    redraw() {
      calls.push({ type: 'redraw' });
    },
    forget(stale) {
      for (const key of [...loaded]) if (stale(key)) loaded.delete(key);
      calls.push({ type: 'forget', kept: [...loaded] });
    },
  };
}

export interface FakeScreen extends ProtectedScreen {
  readonly page: FakeLayer;
  readonly sharp: FakeLayer;
  /** The box it's in. */
  readonly host: unknown;
  readonly closed: boolean;
}

export function fakeScreen(): FakeScreen {
  let host: unknown = null;
  let closed = false;
  return {
    page: fakeLayer(),
    sharp: fakeLayer(),
    get host() {
      return host;
    },
    get closed() {
      return closed;
    },
    mount(next) {
      host = next;
    },
    close() {
      closed = true;
    },
  };
}

/** One frame asked of the server. */
export interface FrameRequest {
  readonly pageKey: string;
  readonly query: Readonly<Record<string, string>>;
  /** Lets the frame through. */
  arrive(): void;
}

/** Frame fetches that arrive at once, or when the test says while `holding`. */
export function fakeFrames() {
  const requests: FrameRequest[] = [];
  const frames = {
    requests,
    holding: false,
    fetchFrame(page: PageRef, query: Readonly<Record<string, string>>): Promise<ArrayBuffer> {
      return new Promise((resolve) => {
        const request = {
          pageKey: encodePageKey(page),
          query,
          arrive: () => resolve(new ArrayBuffer(8)),
        };
        requests.push(request);
        if (!frames.holding) request.arrive();
      });
    },
  };
  return frames;
}

/** A plugin's clock over a manual one. */
export const pluginClockOf = (manual: ManualClock): PluginClock => ({
  after: (ms, run) => manual.clock.after(ms, run),
  nextFrame: (run) => manual.clock.nextFrame!(run),
  hasFrames: true,
});

/** Let what's waiting on promises run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
