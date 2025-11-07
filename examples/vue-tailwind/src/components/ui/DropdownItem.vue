<template>
  <button
    @click="onClick"
    :class="[
      'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100',
      isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700',
    ]"
  >
    <span v-if="icon || $slots.icon" class="flex-shrink-0">
      <slot name="icon">{{ icon }}</slot>
    </span>
    <span><slot /></span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  onClick: () => void;
  icon?: any;
  isActive?: boolean;
}>();
</script>
