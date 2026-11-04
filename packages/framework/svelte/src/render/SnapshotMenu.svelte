<!--
  A menu by the snapshot the `snapshot` tool holds, once it's taken: hidden while the box is
  still dragged, it appears when the pointer lifts. It works in a `<Stage>`'s overlay and in a
  `<PageView>` alike: the surface gives the projection. Compose it from `useSnapshot()`,
  `copyImage()` and `saveFile()`.
-->
<script lang="ts">
  import Anchored from '../anchored/Anchored.svelte';
  import type { SnapshotMenuProps } from './props';
  import { useSnapshot } from './readers.svelte';

  let { children, gap = 8, placement = 'bottom' }: SnapshotMenuProps = $props();

  const snapshot = useSnapshot();
  const anchor = $derived(
    snapshot.current && { page: snapshot.current.page, bounds: snapshot.current.rect },
  );
</script>

{#if anchor}
  <Anchored {anchor} {placement} {gap}>
    {@render children()}
  </Anchored>
{/if}
