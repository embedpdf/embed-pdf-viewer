<script setup lang="ts">
defineProps<{
  className?: string;
  title?: string;
  style?: Record<string, any>;
}>();
</script>

<template>
  <svg
    :class="className"
    :style="style"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    :aria-hidden="!title"
    :role="title ? 'img' : 'presentation'"
  >
    <title v-if="title">{{ title }}</title>
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="2"
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
</template>
