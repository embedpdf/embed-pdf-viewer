<script setup lang="ts">
import ZigzagIcon from './ZigzagIcon.vue';

defineProps<{
  className?: string;
  title?: string;
  style?: Record<string, any>;
}>();
</script>

<template>
  <ZigzagIcon :className="className" :title="title" :style="style" />
</template>
