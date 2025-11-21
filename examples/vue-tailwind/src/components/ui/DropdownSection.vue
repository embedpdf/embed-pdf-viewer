<template>
  <div>
    <div v-if="title" class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {{ title }}
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>
