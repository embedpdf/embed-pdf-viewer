<template>
  <div
    ref="menuRef"
    class="fixed z-50 w-48 rounded-md border border-gray-200 bg-white shadow-lg"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
  >
    <div class="py-1">
      <button
        @click="handleOpenInNewView"
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
      >
        Open in New View
      </button>

      <template v-if="otherViews.length > 0">
        <div class="my-1 border-t border-gray-200" />
        <div class="px-4 py-1 text-xs font-semibold text-gray-500">Move to View</div>
        <button
          v-for="(view, index) in otherViews"
          :key="view.id"
          @click="() => handleMoveToView(view.id)"
          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        >
          View {{ index + 2 }} ({{ view.documentIds.length }} docs)
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { DocumentState } from '@embedpdf/core';
import { useViewManagerCapability, useAllViews } from '@embedpdf/plugin-view-manager/vue';

const props = defineProps<{
  documentState: DocumentState;
  currentViewId: string;
  position: { x: number; y: number };
  onClose: () => void;
}>();

const menuRef = ref<HTMLDivElement | null>(null);
const { provides: viewManager } = useViewManagerCapability();
const allViews = useAllViews();

const otherViews = computed(() => {
  return allViews.value.filter((v) => v.id !== props.currentViewId);
});

const handleOpenInNewView = () => {
  if (!viewManager.value) return;

  const newViewId = viewManager.value.createView();
  viewManager.value.addDocumentToView(newViewId, props.documentState.id);
  viewManager.value.removeDocumentFromView(props.currentViewId, props.documentState.id);
  viewManager.value.setFocusedView(newViewId);
  props.onClose();
};

const handleMoveToView = (targetViewId: string) => {
  if (!viewManager.value) return;
  viewManager.value.moveDocumentBetweenViews(
    props.currentViewId,
    targetViewId,
    props.documentState.id,
  );
  viewManager.value.setFocusedView(targetViewId);
  viewManager.value.setViewActiveDocument(targetViewId, props.documentState.id);
  props.onClose();
};

const handleClickOutside = (e: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    props.onClose();
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>
