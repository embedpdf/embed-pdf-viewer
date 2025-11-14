<template>
  <ToolbarButton
    v-if="pan"
    :onClick="() => pan.togglePan()"
    :isActive="isPanning"
    aria-label="Toggle Pan"
    title="Pan (hand)"
  >
    <HandIcon class="h-4 w-4" title="Pan" />
  </ToolbarButton>
</template>

<script setup lang="ts">
import { usePan } from '@embedpdf/plugin-pan/vue';
import { HandIcon } from './Icons.vue';
import { ToolbarButton } from './ui';

const props = defineProps<{
  documentId: string;
}>();

const { provides: pan, isPanning } = usePan(() => props.documentId);
</script>
