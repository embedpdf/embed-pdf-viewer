<!--
  `useSurface()` with its id as a function over a prop: hands the handle to the test and records
  `{ isOpen, props }` on every change.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useSurface, type SurfaceHandle } from '../../src/shell';

  let { id, seen, handle }: { id: string; seen: unknown[]; handle: { current?: SurfaceHandle } } =
    $props();

  const surface = useSurface(() => id);
  untrack(() => (handle.current = surface));

  $effect(() => {
    seen.push({ isOpen: surface.isOpen, props: surface.props });
  });
</script>
