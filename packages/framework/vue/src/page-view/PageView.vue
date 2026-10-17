<!--
  <PageView>: one page on its own, with no Stage. The same layers, rotation and
  chrome frame as a <Stage> page, but no camera, scroll or zoom, and no
  dependency on the stage plugin. It builds the page's transform from a width
  and provides the same page context, so every layer (<RenderLayer>,
  <SelectionLayer>, …) works here as it does on the Stage. It also provides a
  measured projection, so anchored UI (<SelectionMenu>, an annotation menu)
  works here too: teleported to the body and placed `fixed`, out of reach of
  any ancestor's overflow clipping.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { toPageRef } from '@embedpdf/core';
import type { PageInfo, PageRef } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import type { PageFrame, PageTransform } from '@embedpdf/core-geometry';
import {
  clientPageProjector,
  makePageContext,
  observeClientGeometry,
  pageSurfaceLayout,
  pageViewTransformInput,
  paint,
} from '@embedpdf/web';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import AnchoredScope from '../anchored/AnchoredScope.vue';
import PagePointerSource from '../interaction/PagePointerSource.vue';
import type { ProjectorBinding, ShownPages } from '../anchored/projector';
import { useOptionalCapability } from '../runtime/capabilities';
import { useViewerSettings } from '../runtime/documents';
import { provideDocumentScope, useDocumentId, useKernelValue } from '../runtime/kernel';
import { providePage } from '../runtime/page';
import type { PageContextValue } from '../runtime/page';
import { pixelBox } from '../runtime/surface-box';

// `class` and `style` go on the outer box, not on the fallback.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** The page: its `ref`, which follows it when pages move, or its index, from 0. */
    page: PageRef | number;
    /** Which document to show. Defaults to the document in scope, else the active one. */
    documentId?: string;
    /** The width of the page upright, in pixels: a page turned a quarter is that tall. Default 240. */
    width?: number;
    /** Space reserved around the page for your own labels, in pixels per side; the sides left out are 0. */
    pageFrame?: Partial<PageFrame>;
  }>(),
  { width: 240 },
);

defineSlots<{
  /** Page-space content (layers): it turns with the page. */
  default?(props: { page: PageContextValue }): unknown;
  /** The page's box and its reserved `pageFrame` (a label, a border): never turned. */
  'page-chrome'?(props: { page: PageContextValue }): unknown;
  /** Shown while the document or the page isn't available yet (default: nothing). */
  fallback?(): unknown;
}>();

const scoped = useDocumentId();
const documentId = computed(() => props.documentId ?? scoped.value);
// Everything inside talks to the document this page belongs to.
provideDocumentScope(documentId);

// The page's entry in the document's page list, subscribed: a rotation or a
// reorder updates this surface as it updates a Stage page. Entries are the same
// object per page until the page changes, so identity is the right equality.
const entry = useKernelValue((kernel): PageInfo | null => {
  const id = documentId.value;
  if (!id) return null;
  const pages = kernel.documents.listPages(id);
  const wanted = props.page;
  const found =
    typeof wanted === 'number'
      ? pages[wanted]
      : pages.find((page) => page.ref.objectNumber === wanted.objectNumber);
  return found ?? null;
});

const pageIndex = computed(
  () => entry.value?.index ?? (typeof props.page === 'number' ? props.page : 0),
);
// The page's address is the kernel's; a placeholder (object number = index + 1)
// only until the page is known, and the fallback shows until then anyway. Kept
// by its number, so the context's `ref` is the same object while the page is.
const pageObjectNumber = computed(
  () =>
    entry.value?.ref.objectNumber ??
    (typeof props.page === 'number' ? props.page + 1 : props.page.objectNumber),
);
const pageRef = computed(() => toPageRef(pageObjectNumber.value));

// The sides left out reserve nothing. A new value only when a side changes, so
// an inline `:page-frame="{ bottom: 20 }"` doesn't rebuild the page context on
// every render of its parent.
const frame = computed((previous?: PageFrame): PageFrame => {
  const { top = 0, right = 0, bottom = 0, left = 0 } = props.pageFrame ?? {};
  if (
    previous &&
    previous.top === top &&
    previous.right === right &&
    previous.bottom === bottom &&
    previous.left === left
  ) {
    return previous;
  }
  return { top, right, bottom, left };
});

/**
 * No camera: the page's transform comes straight from the width
 * (`pageViewTransformInput` from `@embedpdf/web`, the same in every framework).
 */
const transform = computed(
  (): PageTransform =>
    pageTransform(
      pageViewTransformInput(
        entry.value,
        props.width,
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      ),
    ),
);

// This page view's own identity: two page views of the same page (a compare
// strip) plan their pictures apart, as two stage views do.
const view = `page-view:${nextViewId()}`;

const content = ref<HTMLDivElement | null>(null);

const context = computed(
  (): PageContextValue =>
    makePageContext(
      documentId.value ?? '',
      view,
      pageRef.value,
      pageIndex.value,
      frame.value,
      transform.value,
      () => content.value!.getBoundingClientRect(),
    ),
);
providePage(context);

/**
 * No camera, so anchored UI is placed by measuring the page element in client
 * space. The projection answers nothing until the page element exists. A new
 * page context is a state-driven change (the binding's revision); the moves
 * the browser makes on its own (the document scrolls, the window resizes) come
 * through `observeClientGeometry`.
 */
const projectorBinding = computed(
  (): ProjectorBinding => ({
    projector: clientPageProjector(context.value, () => content.value !== null),
    revision: context.value,
    subscribe: observeClientGeometry,
  }),
);
// A page view shows its one page.
const shownPages = computed((): ShownPages => new Set([pageObjectNumber.value]));

// The viewer's `page` settings; `--epdf-page-*` CSS variables win over them.
const look = useViewerSettings((settings) => settings.page);

/** With the interaction plugin registered, the page view is the page's pointer surface. */
const interaction = useOptionalCapability(InteractionHostToken);

/** The outer box (page and frame), the shadow at the page's footprint, and the turned content box. */
const boxes = computed(() => {
  const layout = pageSurfaceLayout(transform.value, frame.value);
  return {
    outer: {
      position: 'relative',
      width: `${layout.outer.width}px`,
      height: `${layout.outer.height}px`,
    },
    // The drop shadow only: transparent and axis-aligned, so it never peeks
    // out behind the picture and stays put when the page turns.
    shadow: {
      position: 'absolute',
      ...pixelBox(layout.shadow),
      boxShadow: paint('page-shadow', look.value.shadow),
    },
    // Backing and picture as one box, centred on the footprint and turned about
    // its centre; rotation 0 carries no transform.
    content: {
      position: 'absolute',
      ...pixelBox(layout.content),
      background: paint('page-background', look.value.background),
      transform: layout.turn ?? undefined,
      // Selection highlights are drawn by the layers: no native text or image selection.
      userSelect: 'none',
      WebkitUserSelect: 'none',
    },
  } satisfies Record<string, CSSProperties>;
});
</script>

<script lang="ts">
let viewCount = 0;
/** A number per page view instance, for its view identity. */
function nextViewId(): number {
  viewCount += 1;
  return viewCount;
}
</script>

<template>
  <slot v-if="!documentId || !entry" name="fallback" />
  <AnchoredScope v-else :binding="projectorBinding" :shown="shownPages">
    <!-- Your `class` and `style` go on the outer box, and your style wins. -->
    <div :style="boxes.outer" v-bind="$attrs">
      <div :style="boxes.shadow" />
      <div ref="content" :style="boxes.content">
        <!-- The page's pointer surface, below the layers, like the Stage's own listener: a press
             on a layer that lets the pointer through reaches the tools, a link keeps its own. -->
        <PagePointerSource v-if="interaction" />
        <slot :page="context" />
      </div>
      <slot name="page-chrome" :page="context" />
    </div>
  </AnchoredScope>
</template>
