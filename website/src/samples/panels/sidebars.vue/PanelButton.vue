<script setup lang="ts">
import { useSurface } from '@embedpdf/vue/shell';

// Both panels share the right side: opening one closes the other.
const props = defineProps<{ id: string; label: string }>();
const { isOpen, toggle } = useSurface(() => props.id);
</script>

<template>
  <button
    type="button"
    class="button"
    :aria-pressed="isOpen"
    @click="toggle({ exclusive: 'right' })"
  >
    {{ label }}
  </button>
</template>
