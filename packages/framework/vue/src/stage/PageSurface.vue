<!--
  One page of a <Stage>, placed where the camera puts it. It provides the page
  context to the layers in its default slot (page space: they turn with the
  page) and to its chrome slot (the page's box and its reserved frame, never
  turned).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { toPageRef } from '@embedpdf/core';
import type { PageFrame } from '@embedpdf/core-geometry';
import type { VisiblePage } from '@embedpdf/plugin-stage';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { makePageContext, pageSurfaceLayout, paint, stagePageDemand } from '@embedpdf/web';
import { useViewerSettings } from '../runtime/documents';
import { providePage } from '../runtime/page';
import type { PageContextValue } from '../runtime/page';
import { pixelBox } from '../runtime/surface-box';

const props = defineProps<{
  documentId: string;
  page: VisiblePage;
  /** Reserved chrome bands around the page (screen px); the layout reserved the space. */
  frame: PageFrame;
  /** The stage lens: the page's view demand reads its visibility live. */
  stage: StageHostCapability;
}>();

defineSlots<{
  default?(props: { page: PageContextValue }): unknown;
  chrome?(props: { page: PageContextValue }): unknown;
}>();

const content = ref<HTMLDivElement | null>(null);
// The viewer's `page` settings; `--epdf-page-*` CSS variables win over them.
const look = useViewerSettings((settings) => settings.page);

// The stage rebuilds `VisiblePage.ref` every camera frame; the page's address
// is kept by its number, so layers can watch it.
const pageObjectNumber = computed(() => props.page.ref.objectNumber);
const pageRef = computed(() => toPageRef(pageObjectNumber.value));

/**
 * The page context, a new value only when what it carries changes: a pan moves
 * the page but keeps its transform, so the layers don't update for it.
 */
let inputs: readonly unknown[] = [];
const context = computed((previous?: PageContextValue): PageContextValue => {
  const { transform, pageIndex } = props.page;
  const next = [props.documentId, pageRef.value, pageIndex, props.frame, transform, props.stage];
  if (previous && next.every((value, index) => value === inputs[index])) return previous;
  inputs = next;
  const stage = props.stage;
  const objectNumber = pageObjectNumber.value;
  return makePageContext(
    props.documentId,
    // The hosting lens: per-view raster planning keys its tiles by it.
    stage.getLensId(),
    pageRef.value,
    pageIndex,
    props.frame,
    transform,
    () => content.value!.getBoundingClientRect(),
    // A pull: the stage's live visibility at call time. Off screen is a zero
    // rect ("want nothing").
    () => stagePageDemand(stage, objectNumber, transform.deviceWidth),
  );
});
providePage(context);

/**
 * The outer box (the footprint and the reserved frame), the shadow and the
 * turned content box, all from the transform (`@embedpdf/web`'s layout, the
 * same in every framework).
 */
const boxes = computed(() => {
  const { transform, screenX, screenY } = props.page;
  const layout = pageSurfaceLayout(transform, props.frame, { x: screenX, y: screenY });
  return {
    outer: { position: 'absolute', ...pixelBox(layout.outer) },
    // The drop shadow only: axis-aligned at the footprint, transparent, so it
    // never peeks out behind the picture and stays put when the page turns.
    shadow: {
      position: 'absolute',
      ...pixelBox(layout.shadow),
      boxShadow: paint('page-shadow', look.value.shadow),
    },
    // The page: backing and picture as one box, the only thing rotation turns.
    content: {
      position: 'absolute',
      ...pixelBox(layout.content),
      background: paint('page-background', look.value.background),
      transform: layout.turn ?? undefined,
      // Selection highlights are drawn by the layers: no native text or image
      // selection (or double-click image grab) on the page.
      userSelect: 'none',
      WebkitUserSelect: 'none',
    },
  } satisfies Record<string, CSSProperties>;
});
</script>

<template>
  <div :style="boxes.outer">
    <div :style="boxes.shadow" />
    <div ref="content" :style="boxes.content">
      <slot :page="context" />
    </div>
    <!-- Box-space chrome (labels, a selection border, per-page buttons) fills the outer box. -->
    <slot name="chrome" :page="context" />
  </div>
</template>
