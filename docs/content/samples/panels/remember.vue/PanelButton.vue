<script setup lang="ts">
import { useSurface } from '@embedpdf/vue/shell';

const props = defineProps<{ id: string; label: string; side: 'left' | 'right' }>();
const { isOpen, toggle } = useSurface(() => props.id);
</script>

<template>
  <button
    type="button"
    class="button"
    :aria-pressed="isOpen"
    @click="toggle({ exclusive: side })"
  >
    {{ label }}
  </button>
</template>
