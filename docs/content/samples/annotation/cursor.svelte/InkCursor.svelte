<!-- The pen cursor follows the pen's color. -->
<script lang="ts">
  import { useToolCursor } from '@embedpdf/svelte/interaction';
  import { useAnnotationDefaults } from '@embedpdf/svelte/annotation';

  // A pen, 24 × 24, in a color: its tip is the bottom-left corner.
  const penIcon = (color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<path d="M3 21l1.5-5.5L16 4l4 4L8.5 19.5z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`;

  const defaults = useAnnotationDefaults('ink');

  // A function, so the cursor follows the color.
  useToolCursor(() => ({
    toolId: 'ink',
    cursors: {
      crosshair: { svg: penIcon(defaults.current.color ?? '#000000'), hotspot: { x: 2, y: 22 } },
    },
  }));
</script>
