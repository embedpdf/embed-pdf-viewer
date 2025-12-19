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
    viewBox="0 0 24 24"
    :stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="!title"
    :role="title ? 'img' : 'presentation'"
  >
    <title v-if="title">{{ title }}</title>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <rect x="2" y="6" width="20" height="16" rx="2" fill="currentColor" stroke="none" />
    <path d="M8 16v-8a4 4 0 1 1 8 0v8" stroke="#000000" />
    <path d="M8 10h8" stroke="#000000" />
  </svg>
</template>
