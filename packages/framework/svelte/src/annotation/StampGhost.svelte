<!--
  The armed stamp's ghost: a see-through picture of the stamp in the exact box a click would place
  it (the plugin computes it with the same fit and clamp as placing it). Every other tool's ghost
  rides the page items like a drawing in progress. The picture's bytes stay in the plugin; this
  owns only the object URL, keyed on the armed stamp: a new arm swaps the picture, a disarm (or
  another tool) drops it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    AnnotationToken as AnnotationHostToken,
    previewBucket,
  } from '@embedpdf/plugin-annotation/contract/host';
  import { ghostOpacity, loadObjectUrl, rectInPixels } from '@embedpdf/web';
  import type { PageContextValue } from '../runtime/page';
  import { useOptionalCapability, useOptionalSelector } from '../runtime/readers.svelte';

  let { page }: { page: PageContextValue } = $props();

  const capability = useOptionalCapability(AnnotationHostToken);
  const ghost = useOptionalSelector(
    AnnotationHostToken,
    (annotation) => annotation.getImageGhost(page.ref),
    null,
  );
  const armed = useOptionalSelector(
    AnnotationHostToken,
    (annotation) => annotation.getArmedStamp(),
    null,
  );
  // The ghost is a picture of vector artwork, right at one size: ask for the bucket that covers
  // the box's device width (points × device pixels per point), so it stays sharp at every zoom
  // and density. The plugin keeps one picture per bucket.
  const bucket = $derived(
    ghost.current ? previewBucket(ghost.current.box.width * page.transform.renderScale) : 0,
  );

  let url = $state<string | null>(null);

  $effect(() => {
    const annotation = capability.current;
    const size = bucket;
    void armed.current;
    if (!annotation || !size) {
      url = null;
      return;
    }
    // The previous bucket's picture stays up until this one arrives: no flicker while a zoom
    // crosses a bucket boundary.
    return untrack(() =>
      loadObjectUrl(
        () => annotation.renderArmedStampPreview(size),
        (next) => (url = next),
      ),
    );
  });

  const frame = $derived(ghost.current ? rectInPixels(ghost.current.box, page.transform) : null);
</script>

{#if ghost.current && frame && url}
  <!-- The same explicit size as a baked appearance: a global img reset must never clamp it. -->
  <img
    src={url}
    alt=""
    draggable="false"
    style:position="absolute"
    style:left="{frame.left}px"
    style:top="{frame.top}px"
    style:width="{frame.width}px"
    style:height="{frame.height}px"
    style:max-width="none"
    style:max-height="none"
    style:pointer-events="none"
    style:opacity={ghostOpacity(ghost.current.opacity)}
    style:transform={ghost.current.rot ? `rotate(${ghost.current.rot}deg)` : undefined}
    style:transform-origin={ghost.current.rot ? 'center' : undefined}
  />
{/if}
