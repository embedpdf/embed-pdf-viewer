<!--
  Places its content around a page-space anchor, on whichever page surface it's in: next to a
  selection, an annotation, a search match. Once the content's size is measured, it flips to the
  other side when the chosen one has no room and stays inside the view, unless `pinned`.

  On a page that isn't shown it renders nothing and reads only the pages on screen, so a
  document with hundreds of badges costs only the ones in view while people scroll and zoom.
-->
<script lang="ts">
  import { useShownPages } from './context';
  import PlacedAnchored from './PlacedAnchored.svelte';
  import type { AnchoredProps } from './props';

  let { anchor, placement, gap, pinned, children }: AnchoredProps = $props();

  const shownPages = useShownPages();
  const visible = $derived(
    !!anchor?.bounds && (!shownPages || shownPages().has(anchor.page.objectNumber)),
  );
</script>

{#if visible}
  <PlacedAnchored {anchor} {placement} {gap} {pinned} {children} />
{/if}
