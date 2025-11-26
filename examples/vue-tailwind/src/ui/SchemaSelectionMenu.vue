<template>
  <div v-bind="props.menuWrapperProps">
    <div :style="menuStyle" class="rounded-lg border border-gray-200 bg-white shadow-lg">
      <div class="flex items-center gap-1 px-2 py-1">
        <template v-for="item in schema.items" :key="item.id">
          <SelectionMenuItemRenderer :item="item" :documentId="documentId" :props="props" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import type { SelectionMenuRendererProps } from '@embedpdf/plugin-ui/vue';
import SelectionMenuItemRenderer from './SelectionMenuItemRenderer.vue';

const componentProps = defineProps<SelectionMenuRendererProps>();

const menuStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {
    position: 'absolute',
    pointerEvents: 'auto',
    cursor: 'default',
  };

  if (componentProps.props.placement?.suggestTop) {
    style.top = '-48px'; // -40 - 8
  } else {
    style.top = `${componentProps.props.rect.size.height + 8}px`;
  }

  return style;
});
</script>
