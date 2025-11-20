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
    <path d="M6 20h-1a2 2 0 0 1 -2 -2v-1" />
    <path d="M3 13v-3" />
    <path d="M3 6v-1a2 2 0 0 1 2 -2h1" />
    <path d="M10 3h3" />
    <path d="M17 3h1a2 2 0 0 1 2 2v1" />
    <defs>
      <clipPath id="redactClip">
        <rect x="10" y="10" width="12" height="12" rx="2" />
      </clipPath>
    </defs>
    <rect x="10" y="10" width="12" height="12" rx="2" fill="none" />
    <g clip-path="url(#redactClip)">
      <path d="M-2 24l14 -14" />
      <path d="M2 24l14 -14" />
      <path d="M6 24l14 -14" />
      <path d="M10 24l15 -15" />
      <path d="M14 24l15 -15" />
      <path d="M18 24l15 -15" />
    </g>
  </svg>
</template>
