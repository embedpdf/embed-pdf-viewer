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
    :stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="!title"
    :role="title ? 'img' : 'presentation'"
  >
    <title v-if="title">{{ title }}</title>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M15 14l4 -4l-4 -4" />
    <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
  </svg>
</template>
