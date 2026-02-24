<template>
  <div v-bind="menuWrapperProps">
    <div :style="menuStyle" class="rounded-lg border border-gray-200 bg-white shadow-lg">
      <div class="flex items-center gap-1 px-2 py-1">
        <button
          @click="handleDelete"
          class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600"
          aria-label="Delete redaction"
          title="Delete redaction"
        >
          <TrashIcon class="h-4 w-4" />
        </button>
        <button
          @click="handleCommit"
          class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-600"
          aria-label="Apply redaction"
          title="Apply redaction"
        >
          <CheckIcon class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import type {
  RedactionSelectionContext,
  RedactionSelectionMenuProps,
} from '@embedpdf/plugin-redaction/vue';
import { useRedactionCapability } from '@embedpdf/plugin-redaction/vue';
import TrashIcon from './icons/TrashIcon.vue';
import CheckIcon from './icons/CheckIcon.vue';
import { Rect } from '@embedpdf/models';

const props = defineProps<{
  documentId: string;
  context: RedactionSelectionContext;
  selected: boolean;
  rect: Rect;
  placement: RedactionSelectionMenuProps['placement'];
  menuWrapperProps: RedactionSelectionMenuProps['menuWrapperProps'];
}>();

const { provides: redactionCapability } = useRedactionCapability();

const menuStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  pointerEvents: 'auto',
  cursor: 'default',
  top: `${props.rect.size.height + 8}px`,
}));

const handleDelete = () => {
  const scope = redactionCapability.value?.forDocument(props.documentId);
  if (!scope) return;

  const { item, pageIndex } = props.context;
  scope.removePending(pageIndex, item.id);
};

const handleCommit = () => {
  const scope = redactionCapability.value?.forDocument(props.documentId);
  if (!scope) return;

  const { item, pageIndex } = props.context;
  scope.commitPending(pageIndex, item.id);
};
</script>
