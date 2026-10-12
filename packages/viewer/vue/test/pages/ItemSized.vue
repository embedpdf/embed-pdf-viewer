<!-- Two sizes, as `useToolbarItem()` picks: the toolbar must measure the one it draws. -->
<script setup lang="ts">
import { useToolbarItem } from '@embedpdf/viewer-vue';

const item = useToolbarItem();
</script>

<template>
  <span
    data-check="sized"
    :data-drawn="item.variant ?? 'none'"
    :style="{
      display: 'inline-block',
      overflow: 'hidden',
      width: item.variant === 'short' ? '48px' : '700px',
    }"
  >
    Sized
  </span>
</template>
