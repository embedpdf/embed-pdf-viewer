<!-- Where its toolbar item sits, as the composable says it. -->
<script setup lang="ts">
import { useToolbarItem } from '@embedpdf/viewer-vue';

const item = useToolbarItem();
</script>

<template>
  <span
    data-check="where"
    :data-edge="item.edge"
    :data-size="item.size"
    :data-variant="item.variant ?? 'none'"
    :style="{
      display: 'inline-flex',
      flexDirection: item.orientation === 'vertical' ? 'column' : 'row',
    }"
  >
    {{ item.orientation }}
  </span>
</template>
