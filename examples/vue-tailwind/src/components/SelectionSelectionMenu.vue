<template>
  <div v-bind="menuWrapperProps">
    <div :style="menuStyle" class="rounded-lg border border-gray-200 bg-white shadow-lg">
      <div class="flex items-center gap-1 px-2 py-1">
        <button
          @click="handleCopy"
          class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-600"
          aria-label="Copy text"
          title="Copy text"
        >
          <CopyIcon class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import type {
  SelectionSelectionContext,
  SelectionSelectionMenuProps,
} from '@embedpdf/plugin-selection/vue';
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue';
import CopyIcon from './icons/CopyIcon.vue';
import { Rect } from '@embedpdf/models';

const props = defineProps<{
  documentId: string;
  context: SelectionSelectionContext;
  selected: boolean;
  rect: Rect;
  placement: SelectionSelectionMenuProps['placement'];
  menuWrapperProps: SelectionSelectionMenuProps['menuWrapperProps'];
}>();

const { provides: selectionCapability } = useSelectionCapability();

const menuStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  pointerEvents: 'auto',
  cursor: 'default',
  top: props.placement.suggestTop ? `-48px` : `${props.rect.size.height + 8}px`,
}));

const handleCopy = async () => {
  if (!selectionCapability.value) return;

  const scope = selectionCapability.value.forDocument(props.documentId);
  if (!scope) return;

  // Copy to clipboard
  scope.copyToClipboard();

  // clear selection
  scope.clear();
};
</script>
