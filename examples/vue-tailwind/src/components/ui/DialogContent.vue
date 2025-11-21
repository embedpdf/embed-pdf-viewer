<template>
  <div :class="['space-y-6', className]">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  className?: string;
}>();
</script>
