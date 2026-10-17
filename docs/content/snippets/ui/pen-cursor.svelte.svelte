<script lang="ts">
  import { useToolCursor } from '@embedpdf/svelte/interaction';
  import { penIcon } from './icons';

  let { color }: { color: string } = $props();

  useToolCursor(() => ({
    toolId: 'ink',
    cursors: { crosshair: { svg: penIcon(color), hotspot: { x: 2, y: 22 } } },
  }));
</script>
