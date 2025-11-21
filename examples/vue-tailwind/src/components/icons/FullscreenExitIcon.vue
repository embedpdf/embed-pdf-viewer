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
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="2"
      d="M4 8v-2c0 -.551 .223 -1.05 .584 -1.412"
    />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="2"
      d="M4 16v2a2 2 0 0 0 2 2h2"
    />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="2"
      d="M16 4h2a2 2 0 0 1 2 2v2"
    />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-width="2"
      d="M16 20h2c.545 0 1.04 -.218 1.4 -.572"
    />
    <path stroke-linecap="round" stroke-linejoin="round" :stroke-width="2" d="M3 3l18 18" />
  </svg>
</template>
