<template>
  <div :class="['grid h-full gap-1 p-1', getLayoutClass()]">
    <ViewContext v-for="view in allViews" :key="view.id" :viewId="view.id" v-slot="context">
      <div
        @click="context.focus"
        :class="[
          'relative overflow-hidden border',
          context.isFocused ? 'border-blue-500' : 'border-gray-300',
        ]"
      >
        <slot :context="context" />
      </div>
    </ViewContext>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import {
  useAllViews,
  useViewManagerCapability,
  ViewContext,
  type ViewContextRenderProps,
} from '@embedpdf/plugin-view-manager/vue';

defineProps<{
  renderView?: (context: ViewContextRenderProps) => any;
}>();

const allViews = useAllViews();
const { provides: viewManager } = useViewManagerCapability();

// Auto-remove empty views (except if it's the only view)
watch(
  allViews,
  (views) => {
    if (!viewManager) return;

    const emptyViews = views.filter((v) => v.documentIds.length === 0);

    if (emptyViews.length > 0 && views.length > 1) {
      emptyViews.forEach((emptyView) => {
        if (views.length > 1) {
          viewManager.value?.removeView(emptyView.id);
        }
      });
    }
  },
  { immediate: false },
);

const getLayoutClass = () => {
  switch (allViews.value.length) {
    case 1:
      return 'grid-cols-1';
    case 2:
      return 'grid-cols-2';
    case 3:
    case 4:
      return 'grid-cols-2 grid-rows-2';
    default:
      return 'grid-cols-3';
  }
};
</script>
