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
    <path d="M3 7v-2h12v2" />
    <path d="M9 5v14" />
    <path d="M7 19h4" />
    <path d="M18 15l2 2h-5" />
    <path d="M18 19l2 -2" />
  </svg>
</template>
