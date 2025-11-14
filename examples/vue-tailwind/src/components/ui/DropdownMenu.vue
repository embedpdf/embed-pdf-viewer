<template>
  <!-- Backdrop -->
  <div v-if="isOpen" class="fixed inset-0 z-10" @click="onClose" />

  <!-- Menu -->
  <div
    v-if="isOpen"
    :class="[
      'absolute left-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg',
      className,
    ]"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}>();
</script>
