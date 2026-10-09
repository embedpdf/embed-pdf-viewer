<!--
  One visible page of a Stage: placed where the camera puts it, with its drop shadow, the page
  content (which turns with the page) and the page chrome (which never turns). It provides the
  page context to every layer inside.

  All geometry comes from the page's transform: the display footprint (`viewWidth`/`viewHeight`,
  already swapped for a quarter turn and snapped to device pixels) and the unturned content box
  (`contentWidth`/`contentHeight`). Nothing here multiplies by the zoom or the pixel ratio.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { toPageRef } from '@embedpdf/core';
  import type { PageFrame } from '@embedpdf/core-geometry';
  import type { VisiblePage } from '@embedpdf/plugin-stage';
  import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
  import type { PageViewDemand } from '@embedpdf/plugin-render/contract';
  import {
    livePageContext,
    makePageContext,
    pageSurfaceLayout,
    paint,
    stagePageDemand,
  } from '@embedpdf/web';
  import { useViewerSettings } from '../runtime/documents.svelte';
  import { setPageContext, type PageContextValue } from '../runtime/page';

  let {
    documentId,
    page,
    frame,
    stage,
    content,
    chrome,
  }: {
    documentId: string;
    /** This page as the stage places it now: a new object on every camera frame. */
    page: VisiblePage;
    /** The bands reserved around the page, in screen pixels; the layout left room for them. */
    frame: PageFrame;
    stage: StageHostCapability;
    content: Snippet<[page: PageContextValue]>;
    chrome?: Snippet<[page: PageContextValue]>;
  } = $props();

  let contentElement: HTMLDivElement | undefined;

  // The viewer's `page` settings; `--epdf-page-*` CSS variables win over them.
  const look = useViewerSettings((settings) => settings.page);

  // The Stage keys its pages by object number, so this surface's number never changes: one
  // PageRef for its lifetime, safe for layers to key their work on.
  const pageRef = toPageRef(untrack(() => page.ref.objectNumber));
  // Each its own derived value, so the context below changes only when one of them does, not on
  // every camera frame.
  const pageIndex = $derived(page.pageIndex);
  const transform = $derived(page.transform);

  /**
   * How much of this page the view wants, for raster planning: read live from the stage, a zero
   * box while the page is off screen. It reads `page` first, so a reaction that asks (the tile
   * plane) asks again on every camera frame.
   */
  function viewDemand(): PageViewDemand {
    const placed = page;
    return stagePageDemand(stage, pageRef.objectNumber, placed.transform.deviceWidth);
  }

  const context = $derived(
    makePageContext(
      documentId,
      // The hosting lens: raster planning keys tiles by it, so a thumbnail rail and the main
      // view never fight over one plan.
      stage.getLensId(),
      pageRef,
      pageIndex,
      frame,
      transform,
      () => contentElement!.getBoundingClientRect(),
      viewDemand,
    ),
  );
  const live = livePageContext(() => context);
  setPageContext(live);

  // The outer box (one frame further out than the footprint, so the content keeps its place),
  // the shadow at the footprint, and the content box centred on it and turned about its centre.
  const layout = $derived(
    pageSurfaceLayout(transform, frame, { x: page.screenX, y: page.screenY }),
  );
</script>

<div
  style:position="absolute"
  style:left="{layout.outer.left}px"
  style:top="{layout.outer.top}px"
  style:width="{layout.outer.width}px"
  style:height="{layout.outer.height}px"
>
  <!-- The drop shadow only: at the content box, with no fill, so it never shows behind the
       picture, and it stays put while the page turns. -->
  <div
    style:position="absolute"
    style:left="{layout.shadow.left}px"
    style:top="{layout.shadow.top}px"
    style:width="{layout.shadow.width}px"
    style:height="{layout.shadow.height}px"
    style:box-shadow={paint('page-shadow', look.current.shadow)}
  ></div>
  <!-- The page: its background and its layers as one box, the only thing the rotation turns.
       Native text and image selection is off: the selection layer draws its own. -->
  <div
    bind:this={contentElement}
    style="user-select: none; -webkit-user-select: none"
    style:position="absolute"
    style:left="{layout.content.left}px"
    style:top="{layout.content.top}px"
    style:width="{layout.content.width}px"
    style:height="{layout.content.height}px"
    style:background={paint('page-background', look.current.background)}
    style:transform={layout.turn ?? undefined}
  >
    {@render content(live)}
  </div>
  <!-- The page chrome fills the outer box and never turns. -->
  {@render chrome?.(live)}
</div>
