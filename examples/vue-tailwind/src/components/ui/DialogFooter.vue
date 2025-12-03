<template>
  <div :class="['flex justify-end gap-3 border-t border-gray-200 pt-4', className]">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  className?: string;
}>();
</script>
