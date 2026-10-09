<script lang="ts" module>
  // A pen in the current color, with its tip at the bottom left.
  const penIcon = (color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path d="M3 21l1.6-5.6L16.2 3.8a2.2 2.2 0 0 1 3.1 3.1L7.7 18.5z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
</script>

<!-- While this is mounted, the dot tool's crosshair is a pen in `color`. -->
<script lang="ts">
  import { useToolCursor } from '@embedpdf/svelte/interaction';

  let { color }: { color: string } = $props();

  useToolCursor(() => ({
    toolId: 'dot',
    cursors: { crosshair: { svg: penIcon(color), hotspot: { x: 3, y: 21 } } },
  }));
</script>
