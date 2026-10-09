<script setup lang="ts">
import { useAnnotationDefaults } from '@embedpdf/vue/annotation';
import { useToolCursor } from '@embedpdf/vue/interaction';

import { penIcon } from './icons';

const defaults = useAnnotationDefaults('ink');

// A getter, so the cursor follows the color
useToolCursor(() => ({
  toolId: 'ink',
  cursors: { crosshair: { svg: penIcon(defaults.value.color), hotspot: { x: 2, y: 22 } } },
}));
</script>
