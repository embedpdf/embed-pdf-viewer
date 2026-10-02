<!--
  Anchored content on a page that is shown: it follows the camera. The position is computed from
  the surface's projection (the shared, framework-free `projectAnchoredTarget`) whenever the
  projection, the anchor or the measured size changes. A click inside never reaches the
  surface's own pointer listener, which would read it as a click outside.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    isolatePointerDown,
    observeAnchoredFit,
    projectAnchoredTarget,
    sameAnchoredFit,
    type AnchoredFit,
  } from '@embedpdf/web';
  import { useProjectorBinding } from './context';
  import type { AnchoredProps } from './props';

  let { anchor, placement = 'top', gap = 8, pinned = false, children }: AnchoredProps = $props();

  const binding = useProjectorBinding();
  let element: HTMLDivElement | undefined = $state();
  // The content's size and the view's: measured once it's in the DOM, and again when either
  // resizes. A camera move changes neither.
  let fit = $state.raw<AnchoredFit | null>(null);
  // Changes no state announces: a `<PageView>` that moved because the document scrolled, and the
  // first pass of a client-space surface, which can only measure once it's in the DOM.
  let browserMoves = $state(0);

  $effect(() => {
    const subscribe = binding().subscribe;
    if (!subscribe) return;
    return subscribe(() => untrack(() => browserMoves++));
  });
  $effect(() => {
    if (binding().projector.space !== 'client') return;
    void anchor;
    untrack(() => browserMoves++);
  });

  $effect(() => {
    const target = element;
    const space = binding().projector.space;
    if (!target) return;
    return observeAnchoredFit(target, space, (next) => {
      if (
        !sameAnchoredFit(
          untrack(() => fit),
          next,
        )
      )
        fit = next;
    });
  });

  // A native listener: Svelte delegates `onpointerdown` to the root, which the press reaches
  // only after the surface's own listener saw it.
  $effect(() => {
    if (!element) return;
    return isolatePointerDown(element);
  });

  const projector = $derived(binding().projector);
  const position = $derived.by(() => {
    void binding().revision;
    void browserMoves;
    if (!anchor?.bounds) return null;
    return projectAnchoredTarget(
      projector,
      { ...anchor, bounds: anchor.bounds },
      { placement, gap, pinned },
      fit,
    );
  });

  /** Client-space content lives on the body, where no ancestor's overflow clips it. */
  function portal(node: HTMLElement) {
    if (projector.space !== 'client') return;
    node.ownerDocument.body.appendChild(node);
    return () => node.remove();
  }
</script>

{#if position}
  <div
    bind:this={element}
    {@attach portal}
    style:position={projector.space === 'client' ? 'fixed' : 'absolute'}
    style:left="{position.left}px"
    style:top="{position.top}px"
    style:width="max-content"
    style:transform={position.transform}
    style:pointer-events="auto"
  >
    {@render children?.()}
  </div>
{/if}
