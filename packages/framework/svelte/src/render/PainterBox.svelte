<!--
  The page's box, lent to the plugin that paints its picture: it paints into it once, follows
  the page as it changes, and takes the picture away when the page goes or the painter is given
  back.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { PaintedPicture, PicturePainter } from '@embedpdf/plugin-render';
  import { usePage } from '../runtime/page';

  let { painter }: { painter: PicturePainter<HTMLElement> } = $props();

  const page = usePage();
  // The page context reads through one value that moves with every camera frame: the ref, the
  // same object while the page is, settles that to the page changing.
  const ref = $derived(page.ref);
  let host = $state<HTMLDivElement>();
  // What a page update can move: the page context is one live object, so the box compares what
  // it reads instead of the object.
  const placeOf = () => [page.transform, page.pageIndex, page.frame] as const;
  let painted: { picture: PaintedPicture; place: ReturnType<typeof placeOf> } | null = null;

  // Another painter or another page paints anew.
  $effect(() => {
    const element = host;
    const current = painter;
    void ref;
    if (!element) return;
    const entry = untrack(() => ({ picture: current.paint(element, page), place: placeOf() }));
    painted = entry;
    return () => {
      entry.picture.destroy();
      if (painted === entry) painted = null;
    };
  });

  // The page moving (zoom, turn, reorder) is an update of the same picture.
  $effect(() => {
    const place = placeOf();
    const current = painted;
    if (!current || place.every((member, index) => member === current.place[index])) return;
    current.place = place;
    untrack(() => current.picture.update(page));
  });
</script>

<div
  bind:this={host}
  style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none"
></div>
