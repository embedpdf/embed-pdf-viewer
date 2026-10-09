<!--
  The default "More" button: a plain ⋯ that opens and closes the menu. The
  default folded group uses it too.
-->
<script setup lang="ts">
import { ACTIVE, BORDER } from './paint';

defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    aria-haspopup="menu"
    :aria-expanded="isOpen"
    title="More"
    :style="{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 8px',
      color: 'inherit',
      font: 'inherit',
      border: `1px solid ${BORDER}`,
      borderRadius: '4px',
      background: isOpen ? ACTIVE : 'transparent',
      cursor: 'pointer',
    }"
    @click="emit('toggle')"
  >
    ⋯
  </button>
</template>
