<!--
  One page on its own, with no Stage: the same layers, rotation and chrome frame as a `<Stage>`
  page, but no camera, scrolling or zoom, and no need for the stage plugin.

  It builds the page's transform from a width, and provides the same page context a Stage page
  does, so every layer (`<RenderLayer>`, the selection, search matches) works here unchanged. It
  provides a projection too, measured from the page element in client space, so anchored UI (a
  selection menu) works here as well: it sits on `<body>`, where no card or scrolling list clips it.
-->
<script lang="ts">
  import { toPageRef } from '@embedpdf/core';
  import { pageTransform, type PageFrame } from '@embedpdf/core-geometry';
  import {
    clientPageProjector,
    livePageContext,
    makePageContext,
    observeClientGeometry,
    pageSurfaceLayout,
    pageViewTransformInput,
    paint,
  } from '@embedpdf/web';
  import {
    setProjectorBinding,
    setShownPages,
    type ProjectorBinding,
    type ShownPages,
  } from '../anchored/context';
  import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
  import PagePointerSource from '../interaction/PagePointerSource.svelte';
  import DocumentScope from '../runtime/DocumentScope.svelte';
  import { useViewerSettings } from '../runtime/documents.svelte';
  import { setPageContext } from '../runtime/page';
  import { useDocumentId, useKernelValue, useOptionalCapability } from '../runtime/readers.svelte';
  import type { PageViewProps } from './props';

  let {
    page: wanted,
    documentId,
    fallback,
    width = 240,
    pageFrame: framePatch,
    children,
    pageChrome,
    class: className,
    style,
  }: PageViewProps = $props();

  // The document a <DocumentScope> around it names, else the active one.
  const inScope = useDocumentId();
  const docId = $derived(documentId ?? inScope.current);
  // With the interaction plugin registered, the page view is the page's pointer surface.
  const interaction = useOptionalCapability(InteractionHostToken);

  // The page asked for: by its ref (which follows it when pages move) or by its index.
  const wantedObjectNumber = $derived(typeof wanted === 'number' ? null : wanted.objectNumber);
  const wantedIndex = $derived(typeof wanted === 'number' ? wanted : null);

  // The page's entry in the document's page list, subscribed: a rotation or a move redraws this
  // surface as it redraws a Stage page. Entries keep their identity until the page changes.
  const base = useKernelValue((kernel) => {
    if (!docId) return null;
    const pages = kernel.documents.listPages(docId);
    const found =
      wantedObjectNumber !== null
        ? pages.find((info) => info.ref.objectNumber === wantedObjectNumber)
        : pages[wantedIndex ?? 0];
    return found ?? null;
  });

  const pageIndex = $derived(base.current?.index ?? wantedIndex ?? 0);
  // The page's address is the document's; a stand-in (object number = index + 1) only until the
  // page list is known, and the fallback shows until then anyway. Derived from the number, so
  // the context's `ref` keeps its identity while the number stays (layers key work on it).
  const pageObjectNumber = $derived(
    base.current?.ref.objectNumber ?? wantedObjectNumber ?? pageIndex + 1,
  );
  const pageRef = $derived(toPageRef(pageObjectNumber));

  // The sides left out reserve nothing; built from the four numbers, so an equal frame passed
  // again as a new object changes nothing.
  const frameTop = $derived(framePatch?.top ?? 0);
  const frameRight = $derived(framePatch?.right ?? 0);
  const frameBottom = $derived(framePatch?.bottom ?? 0);
  const frameLeft = $derived(framePatch?.left ?? 0);
  const frame: PageFrame = $derived({
    top: frameTop,
    right: frameRight,
    bottom: frameBottom,
    left: frameLeft,
  });

  // What the transform depends on, each a value of its own, so an entry that changed something
  // else keeps the transform.
  const pageWidth = $derived(base.current?.size.width ?? null);
  const pageHeight = $derived(base.current?.size.height ?? null);
  const userUnit = $derived(base.current?.userUnit ?? 1);
  const rotation = $derived(base.current?.rotation ?? 0);

  // No camera: the transform comes from the width asked for (`pageViewTransformInput` from
  // `@embedpdf/web`, the same in every framework).
  const transform = $derived(
    pageTransform(
      pageViewTransformInput(
        pageWidth !== null && pageHeight !== null
          ? { size: { width: pageWidth, height: pageHeight }, rotation, userUnit }
          : null,
        width,
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      ),
    ),
  );

  // The page content box, once it's in the DOM: the client conversions measure it, and the
  // projection answers nothing until it's there.
  let contentElement = $state<HTMLDivElement | null>(null);

  // This instance's view identity: two page views of one page (a compare strip) plan their
  // rasters apart, as two stage lenses do.
  const viewId = $props.id();
  const context = $derived(
    makePageContext(docId ?? '', `page-view:${viewId}`, pageRef, pageIndex, frame, transform, () =>
      contentElement!.getBoundingClientRect(),
    ),
  );
  const live = livePageContext(() => context);
  setPageContext(live);

  // The projection: no camera, so anchored UI is placed by measuring the page element in client
  // space. `mounted` reads the element, a state value, so a placement computed before the
  // element existed is computed again once it does. A new context (a new transform or page) is
  // the binding's revision; `observeClientGeometry` reports what no state announces (the
  // document scrolled, the window resized).
  const projectorBinding: ProjectorBinding = $derived({
    projector: clientPageProjector(context, () => contentElement !== null),
    revision: context,
    subscribe: observeClientGeometry,
  });
  setProjectorBinding(() => projectorBinding);
  // A page view shows its one page.
  const shownPages: ShownPages = $derived(new Set([pageObjectNumber]));
  setShownPages(() => shownPages);

  // The viewer's `page` settings; `--epdf-page-*` CSS variables win over them.
  const look = useViewerSettings((settings) => settings.page);

  // The outer box, the shadow at the footprint, and the content box centred on it and turned
  // about its centre, as on a Stage page.
  const layout = $derived(pageSurfaceLayout(transform, frame));
</script>

{#if docId && base.current}
  <DocumentScope id={docId}>
    <div
      class={className}
      style="position: relative; width: {layout.outer.width}px; height: {layout.outer
        .height}px;{style ? ` ${style}` : ''}"
    >
      <!-- The drop shadow only: at the footprint, with no fill, so it never shows behind the
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
        <!-- The page's pointer surface, below the layers, like the Stage's own listener: a press
             on a layer that lets the pointer through reaches the tools, a link keeps its own. -->
        {#if interaction.current}<PagePointerSource />{/if}
        {@render children(live)}
      </div>
      <!-- The page chrome fills the outer box and never turns. -->
      {@render pageChrome?.(live)}
    </div>
  </DocumentScope>
{:else}
  {@render fallback?.()}
{/if}
