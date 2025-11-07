<template>
  <button
    @click="onClick"
    :disabled="disabled"
    :class="[
      'rounded px-2 py-1.5 text-sm transition-colors',
      isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100',
      disabled ? 'cursor-not-allowed opacity-50' : '',
    ]"
    :title="title"
    :aria-label="ariaLabel"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  onClick?: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}>();
</script>
