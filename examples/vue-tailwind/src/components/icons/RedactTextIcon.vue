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
    <path d="M7 4h10" />
    <path d="M12 4v8" />
    <defs>
      <clipPath id="stripeClip">
        <rect x="2" y="12" width="20" height="10" rx="2" />
      </clipPath>
    </defs>
    <rect x="2" y="12" width="20" height="10" rx="2" fill="none" />
    <g clip-path="url(#stripeClip)">
      <path d="M-7 24l12 -12" />
      <path d="M-3 24l12 -12" />
      <path d="M1 24l12 -12" />
      <path d="M5 24l12 -12" />
      <path d="M9 24l12 -12" />
      <path d="M13 24l12 -12" />
      <path d="M17 24l12 -12" />
      <path d="M21 24l12 -12" />
      <path d="M25 24l12 -12" />
    </g>
  </svg>
</template>
