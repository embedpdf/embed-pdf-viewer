<script lang="ts">
  import { useAnnotationDefaults } from '@embedpdf/svelte/annotation';
  import { useToolCursor } from '@embedpdf/svelte/interaction';

  import { penIcon } from './icons';

  const defaults = useAnnotationDefaults('ink');

  // A function, so the cursor follows the color
  useToolCursor(() => ({
    toolId: 'ink',
    cursors: { crosshair: { svg: penIcon(defaults.current.color), hotspot: { x: 2, y: 22 } } },
  }));
</script>
