<script setup lang="ts">
import {
  useRedactionCapability,
  type RedactionSelectionContext,
  type RedactionSelectionMenuProps,
} from '@embedpdf/plugin-redaction/vue';
import type { Rect } from '@embedpdf/models';

const props = defineProps<{
  documentId: string;
  context: RedactionSelectionContext;
  selected: boolean;
  rect: Rect;
  placement: RedactionSelectionMenuProps['placement'];
  menuWrapperProps: RedactionSelectionMenuProps['menuWrapperProps'];
}>();

const { provides: redaction } = useRedactionCapability();

const handleDelete = (e: Event) => {
  e.stopPropagation();
  if (!redaction.value) return;
  const { page, id } = props.context.item;
  redaction.value.removePending(page, id);
};

const handleCommit = (e: Event) => {
  e.stopPropagation();
  if (!redaction.value) return;
  const { page, id } = props.context.item;
  redaction.value.commitPending(page, id);
};
</script>

<template>
  <span v-bind="menuWrapperProps">
    <v-card
      elevation="2"
      class="pa-1"
      :style="{
        position: 'absolute',
        top: `${rect.size.height + 8}px`,
        left: '0',
        zIndex: 1000,
        cursor: 'default',
        pointerEvents: 'auto',
      }"
    >
      <div class="d-flex align-center ga-1">
        <v-btn
          icon="mdi-delete-outline"
          size="small"
          variant="text"
          @click="handleDelete"
          aria-label="Delete redaction"
        />
        <v-btn
          icon="mdi-check"
          size="small"
          variant="text"
          @click="handleCommit"
          aria-label="Commit redaction"
        />
      </div>
    </v-card>
  </span>
</template>

<style scoped>
.d-flex {
  display: flex;
}
.align-center {
  align-items: center;
}
.ga-1 {
  gap: 0.25rem;
}
</style>
