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
    <g transform="rotate(47.565 12.1875 10.75)">
      <path
        stroke="#000000"
        d="m14.18752,16.75l0,-12c0,-1.1 -0.9,-2 -2,-2s-2,0.9 -2,2l0,12l2,2l2,-2z"
      />
      <path stroke="#000000" d="m10.18752,6.75l4,0" />
    </g>
    <path
      stroke="currentColor"
      d="m19.37499,20.125c0.56874,0.0625 -4.04999,-0.5625 -6.41249,-0.4375c-2.3625,0.125 -4.75833,1.22916 -6.85624,1.625c-1.76458,0.6875 -3.40416,-0.9375 -1.98125,-2.49999"
    />
  </svg>
</template>
