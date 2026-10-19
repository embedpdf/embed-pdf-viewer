<!--
  <Stage>: lays out the pages by the camera, mounts only the visible ones, and
  handles scrolling, zoom and page navigation with the mouse, the keyboard and
  touch. Three slots, three coordinate spaces: `#page` draws a page's content
  (it turns with the page), `#page-chrome` its box and reserved frame (never
  turned), and `#overlay` the view (menus, controls, scrollbars).
  `v-model:page`, `v-model:zoom` and `v-model:tool` keep a value of yours in
  step with the view.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { shallowEqual } from '@embedpdf/core';
import { NO_FRAME } from '@embedpdf/core-geometry';
import type { PageFrame } from '@embedpdf/core-geometry';
import { createScrollHandler } from '@embedpdf/plugin-stage';
import type { VisiblePage } from '@embedpdf/plugin-stage';
import { InteractionToken as InteractionPublicToken } from '@embedpdf/plugin-interaction/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { createStageSurface, stageViewProjector } from '@embedpdf/web';
import type { ViewProjector } from '@embedpdf/web';
import AnchoredScope from '../anchored/AnchoredScope.vue';
import type { ProjectorBinding, ShownPages } from '../anchored/projector';
import {
  useCapabilityEvent,
  useOptionalCapability,
  useOptionalSelector,
} from '../runtime/capabilities';
import { useDocumentId, useKernelValue } from '../runtime/kernel';
import type { PageContextValue } from '../runtime/page';
import { asHost } from './composables';
import PageSurface from './PageSurface.vue';
import { provideStageToken, useStageToken } from './scope';
import type { StageTokenProp } from './scope';

const props = defineProps<{
  /** The stage lens to drive: the nearest `<StageScope>`'s, else the main `StageToken`. */
  token?: StageTokenProp;
  /** `v-model:page`: the current page's index, from 0. Setting it goes to that page. */
  page?: number;
  /** `v-model:zoom`: the zoom level, `1` is 100%. Setting it zooms there. */
  zoom?: number;
  /**
   * `v-model:tool`: while set, the active tool follows it (again when the
   * document changes), and every tool change is reported back.
   */
  tool?: string;
}>();

const emit = defineEmits<{
  'update:page': [pageIndex: number];
  'update:zoom': [level: number];
  'update:tool': [toolId: string];
}>();

defineSlots<{
  /** A visible page's content: layers in page coordinates, turned with the page. */
  page(props: { page: PageContextValue }): unknown;
  /** A visible page's chrome: its box and the reserved `pageFrame`, never turned. */
  'page-chrome'?(props: { page: PageContextValue }): unknown;
  /** The view: menus, controls and `<Anchored>` UI above the pages. */
  overlay?(): unknown;
}>();

const token = useStageToken(() => props.token);
// The surface is a host of the lens: it reports the viewport, drives gestures
// and reads the lens id. The host contract is the same runtime token, typed wider.
const hostToken = computed(() => asHost(token.value));
const stage = useOptionalCapability(hostToken);
const interaction = useOptionalCapability(InteractionToken);
const documentId = useDocumentId();

// Everything inside binds to this lens: a `useStageState()` in a page's chrome
// or a `<Scrollbar>` in the overlay needs no token.
provideStageToken(token);

// ── the pages ──────────────────────────────────────────────────────────────

const NO_PAGES: readonly VisiblePage[] = Object.freeze([]);
// The visible pages already fold in the camera (each carries its snapped
// screen position and transform), so a pan is a new list.
const pages = useOptionalSelector(hostToken, (lens) => lens.listVisiblePages(), NO_PAGES);
const sameFrame = (left: PageFrame, right: PageFrame) =>
  left.top === right.top &&
  left.right === right.right &&
  left.bottom === right.bottom &&
  left.left === right.left;
// Reserved chrome bands (screen px), the same for every page.
const frame = useOptionalSelector(
  hostToken,
  (lens) => lens.getSettings().pageFrame,
  NO_FRAME,
  sameFrame,
);

// ── pointer input ──────────────────────────────────────────────────────────

const DEFAULT_INPUT = { interaction: true, panFallback: true, zoomGestures: true };
// How this view takes pointer input is its own settings: a change rebinds the surface.
const input = useOptionalSelector(
  hostToken,
  (lens) => {
    const { interaction: routed, panFallback, zoomGestures } = lens.getSettings();
    return { interaction: routed, panFallback, zoomGestures };
  },
  DEFAULT_INPUT,
  shallowEqual,
);
// Routing pointer input to the interaction hub also registers this view's
// pan-scroll handler with it, scoped to the view, so two Stages on one document
// never pan each other. Without the hub the Stage pans by itself.
const routesToHub = computed(() => input.value.interaction && interaction.value !== null);
// The hub's cursor (text, grab, …), shown on the view while it routes there.
const hubCursor = useKernelValue(() => interaction.value?.getCursor() ?? 'default');

const element = ref<HTMLDivElement | null>(null);
watch(
  [
    element,
    stage,
    interaction,
    routesToHub,
    () => input.value.zoomGestures,
    () => input.value.panFallback,
  ],
  ([viewport, lens, hub, routed, zoomGestures, panFallback], _previous, onCleanup) => {
    if (!viewport || !lens) return;
    // The whole browser binding (viewport and pixel-ratio reports, sample
    // normalization, gestures) is the shared `@embedpdf/web` surface, so every
    // framework has one feel.
    const detachSurface = createStageSurface(viewport, lens, {
      hub: routed ? hub : null,
      source: lens.getLensId(),
      zoomGestures,
    });
    const offScroll =
      routed && hub
        ? hub.registerHandler(createScrollHandler(lens, hub, { panFallback }), {
            source: lens.getLensId(),
          })
        : null;
    onCleanup(() => {
      offScroll?.();
      detachSurface();
    });
  },
  { immediate: true, flush: 'post' },
);

// ── v-model:tool ───────────────────────────────────────────────────────────

watch(
  [() => props.tool, interaction],
  ([tool, hub]) => {
    if (tool === undefined || !hub) return;
    if (hub.getActiveToolId() !== tool) hub.activateTool(tool);
  },
  { immediate: true },
);
useCapabilityEvent(
  InteractionPublicToken,
  (hub) => hub.onToolChanged,
  (event) => emit('update:tool', event.toolId),
);

// ── v-model:page and v-model:zoom ──────────────────────────────────────────
// A value the view reported comes back as the prop: it is the view's own, so
// it is not applied again (that would fight a glide still under way).

let reportedPage: number | undefined;
watch(
  () => props.page,
  (pageIndex) => {
    const lens = stage.value;
    if (pageIndex === undefined || !lens || pageIndex === reportedPage) return;
    if (lens.getCurrentPageIndex() !== pageIndex) lens.goToPage(pageIndex);
  },
  { immediate: true },
);
useCapabilityEvent(
  hostToken,
  (lens) => lens.onPageChanged,
  ({ pageIndex }) => {
    reportedPage = pageIndex;
    emit('update:page', pageIndex);
  },
);

let reportedZoom: number | undefined;
watch(
  () => props.zoom,
  (level) => {
    const lens = stage.value;
    if (level === undefined || !lens || level === reportedZoom) return;
    if (lens.getZoomLevel() !== level) lens.zoomTo(level);
  },
  { immediate: true },
);
useCapabilityEvent(
  hostToken,
  (lens) => lens.onZoomChanged,
  ({ level }) => {
    reportedZoom = level;
    emit('update:zoom', level);
  },
);

// ── the overlay ────────────────────────────────────────────────────────────

/**
 * The Stage's projector: anchored UI positions through the camera, from state
 * alone (no DOM reads). The visible pages are the binding's revision, so a
 * camera move updates the pages and every anchored element in the same render.
 */
const projector = computed((): ViewProjector | null => {
  const lens = stage.value;
  return lens ? stageViewProjector(() => lens) : null;
});
const projectorBinding = computed((): ProjectorBinding | null =>
  projector.value ? { projector: projector.value, revision: pages.value } : null,
);
// The pages on screen, a new value only when a page comes or goes, so anchored
// UI on the other pages sits out every camera frame.
let shownKey = '';
const shownPages = computed((previous?: ShownPages): ShownPages => {
  const key = pages.value.map((visiblePage) => visiblePage.ref.objectNumber).join(',');
  if (previous && key === shownKey) return previous;
  shownKey = key;
  return new Set(pages.value.map((visiblePage) => visiblePage.ref.objectNumber));
});
</script>

<template>
  <div
    ref="element"
    :style="{
      position: 'relative',
      overflow: 'hidden',
      touchAction: 'none',
      cursor: routesToHub ? hubCursor : undefined,
    }"
  >
    <PageSurface
      v-for="visiblePage in pages"
      :key="visiblePage.ref.objectNumber"
      :document-id="documentId ?? ''"
      :page="visiblePage"
      :frame="frame"
      :stage="stage!"
    >
      <template #default="{ page }">
        <slot name="page" :page="page" />
      </template>
      <template v-if="$slots['page-chrome']" #chrome="{ page }">
        <slot name="page-chrome" :page="page" />
      </template>
    </PageSurface>
    <!-- Anchored UI mounts here: its absolute coordinates are the view's. -->
    <AnchoredScope
      v-if="projectorBinding && $slots.overlay"
      :binding="projectorBinding"
      :shown="shownPages"
    >
      <slot name="overlay" />
    </AnchoredScope>
  </div>
</template>
