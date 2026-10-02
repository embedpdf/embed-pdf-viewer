import { h, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createCapabilityToken, toPageRef } from '@embedpdf/core';
import type { CapabilityToken, DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { Anchored } from '../src/anchored';
import { DocumentGate, usePage } from '../src/runtime';
import {
  DEFAULT_SETTINGS,
  Stage,
  StageScope,
  StageToken,
  stagePlugin,
  stageState,
  useStageSettings,
  useStageState,
  useStageToken,
} from '../src/stage';
import type { StageCapability, StageStateValue, StageTokenProp } from '../src/stage';
import type { FieldRefs } from '../src/runtime';
import { bytesInput, probe, settle, until, viewerWith } from './counter-plugin';

/**
 * The Stage: its state and settings composables with and without a document,
 * each view through its own token or the nearest scope, the pages it mounts
 * with their context, its slots, and its two-way values.
 */

const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
const plugins = [
  stagePlugin(),
  stagePlugin({ id: 'stage-thumbs', token: ThumbsToken, layout: 'grid', interaction: false }),
];
const latest = (renders: unknown[]) => renders[renders.length - 1];
const asHost = (token: CapabilityToken<StageCapability>) =>
  token as unknown as CapabilityToken<StageHostCapability>;

/** A document of three Letter-sized pages. */
const pageAt = (index: number): PageLayout => {
  const box = { x: 0, y: 0, width: 612, height: 792 };
  return {
    index,
    ref: toPageRef(index + 1),
    label: null,
    size: { width: 612, height: 792 },
    rotation: 0,
    userUnit: 1,
    boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
    pdfCropBox: { left: 0, bottom: 0, right: 612, top: 792 },
  };
};
const threePages = {
  open: (input: { id?: string }) =>
    Promise.resolve({
      id: input.id ?? 'doc',
      events: { subscribe: () => () => {}, lastServerId: () => null },
      pages: { list: () => Promise.resolve({ pageCount: 3, pages: [0, 1, 2].map(pageAt) }) },
      security: { allows: () => true, allowsAnnotation: () => true },
      close: () => Promise.resolve(),
    } as unknown as DocumentHandle),
  destroy: () => Promise.resolve(),
} as unknown as Engine;

enableAutoUnmount(afterEach);

describe('useStageState', () => {
  it('reads empty with no document, and the view’s state once one is open', async () => {
    const renders: unknown[] = [];
    const Probe = probe(() => {
      const state = useStageState((value) => value);
      return () => {
        renders.push(state.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    expect(latest(renders)).toBe(stageState.empty);

    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(latest(renders)).toMatchObject({ currentPageIndex: 0, pageCount: 1, viewRotation: 0 });

    kernel.capability(StageToken).setViewRotation(90);
    await settle();
    expect(latest(renders)).toMatchObject({ viewRotation: 90 });
  });

  it('gives a ref per field without a selector', async () => {
    let fields: FieldRefs<StageStateValue> | null = null;
    const Probe = probe(() => {
      fields = useStageState();
    });
    await viewerWith(plugins, () => h(Probe));
    expect(Object.keys(fields!).sort()).toEqual(Object.keys(stageState.empty).sort());
    expect(fields!.zoomLevel.value).toBe(1);
  });

  it('reads the view a token names, or the nearest scope', async () => {
    const main: unknown[] = [];
    const named: unknown[] = [];
    const scoped: unknown[] = [];
    const rotationInto = (renders: unknown[], token?: StageTokenProp) =>
      probe(() => {
        const rotation = useStageState((state) => state.viewRotation, token);
        return () => {
          renders.push(rotation.value);
          return null;
        };
      });
    const Main = rotationInto(main);
    const Named = rotationInto(named, ThumbsToken);
    const Scoped = rotationInto(scoped);
    const { kernel } = await viewerWith(plugins, () => [
      h(Main),
      h(Named),
      h(StageScope, { token: ThumbsToken }, () => h(Scoped)),
    ]);
    await kernel.documents.open(bytesInput('a'));
    kernel.capability(asHost(ThumbsToken)).setViewRotation(180);
    await settle();
    expect(latest(main)).toBe(0);
    expect(latest(named)).toBe(180);
    expect(latest(scoped)).toBe(180);
  });
});

describe('useStageSettings', () => {
  it('reads the defaults with no document, then the view’s settings as they change', async () => {
    const renders: unknown[] = [];
    const Probe = probe(() => {
      const { layout } = useStageSettings();
      return () => {
        renders.push(layout.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    expect(latest(renders)).toBe(DEFAULT_SETTINGS.layout);

    await kernel.documents.open(bytesInput('a'));
    kernel.capability(StageToken).updateSettings({ layout: 'horizontal' });
    await settle();
    expect(latest(renders)).toBe('horizontal');
  });
});

describe('StageScope', () => {
  const thumbs = createCapabilityToken<StageCapability>('stage-thumbs');
  const other = createCapabilityToken<StageCapability>('stage-other');
  const tokenInto = (seen: StageTokenProp[], explicit?: StageTokenProp) =>
    probe(() => {
      seen.push(useStageToken(explicit).value);
    });

  it('defaults to the main lens outside any scope', () => {
    const seen: StageTokenProp[] = [];
    mount(tokenInto(seen));
    expect(seen).toEqual([StageToken]);
  });

  it('binds to the nearest scope, and an explicit token still wins', () => {
    const seen: StageTokenProp[] = [];
    mount(() =>
      h(StageScope, { token: other }, () => [
        h(StageScope, { token: thumbs }, () => [
          h(tokenInto(seen)),
          h(tokenInto(seen, StageToken)),
        ]),
        h(tokenInto(seen)),
      ]),
    );
    expect(seen).toEqual([thumbs, StageToken, other]);
  });
});

describe('<Stage>', () => {
  /** A Stage in a gate, given a viewport (happy-dom measures nothing), and its kernel. */
  async function stageWith(stage: () => ReturnType<typeof h>) {
    const viewer = await viewerWith(
      [stagePlugin({ scrollBehavior: 'instant' })],
      () => h(DocumentGate, null, stage),
      threePages,
    );
    await viewer.kernel.documents.open(bytesInput('a'));
    await settle();
    viewer.kernel.capability(asHost(StageToken)).setViewportSize({ width: 800, height: 600 });
    await settle();
    return viewer;
  }

  it('mounts the visible pages, each with its page context, chrome and the overlay', async () => {
    const PageProbe = probe(() => {
      const page = usePage();
      return () => h('i', { class: 'layer' }, String(page.value.pageIndex));
    });
    const { wrapper } = await stageWith(() =>
      h(Stage, null, {
        page: ({ page }: { page: { pageIndex: number } }) => [
          h('b', { class: 'slot' }, String(page.pageIndex)),
          h(PageProbe),
        ],
        'page-chrome': ({ page }: { page: { pageIndex: number } }) =>
          h('span', { class: 'label' }, `Page ${page.pageIndex + 1}`),
        overlay: () =>
          h(
            Anchored,
            { anchor: { page: toPageRef(1), bounds: { x: 10, y: 10, width: 20, height: 20 } } },
            () => h('span', { class: 'badge' }, '✓'),
          ),
      }),
    );
    await until(() => wrapper.findAll('.slot').length > 0);
    expect(wrapper.find('.slot').text()).toBe('0');
    expect(wrapper.find('.layer').text()).toBe('0');
    expect(wrapper.find('.label').text()).toBe('Page 1');
    expect(wrapper.find('.badge').exists()).toBe(true);
  });

  it('v-model:zoom and v-model:page follow the view, and move it when they change', async () => {
    const zoom = ref<number | undefined>(undefined);
    const page = ref<number | undefined>(undefined);
    const { kernel } = await stageWith(() =>
      h(
        Stage,
        {
          zoom: zoom.value,
          'onUpdate:zoom': (level: number) => (zoom.value = level),
          page: page.value,
          'onUpdate:page': (pageIndex: number) => (page.value = pageIndex),
        },
        { page: () => null },
      ),
    );
    const stage = kernel.capability(StageToken);

    // The view changes: the values follow.
    stage.zoomTo(2);
    stage.goToPage(1);
    await settle();
    expect(zoom.value).toBe(2);
    expect(page.value).toBe(1);

    // The values change: the view follows.
    zoom.value = 1.5;
    page.value = 2;
    await settle();
    expect(stage.getZoomLevel()).toBe(1.5);
    expect(stage.getCurrentPageIndex()).toBe(2);
  });
});
