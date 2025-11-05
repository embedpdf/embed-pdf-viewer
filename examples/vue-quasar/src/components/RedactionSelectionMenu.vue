<script setup lang="ts">
import { useRedactionCapability } from '@embedpdf/plugin-redaction/vue';
import type { RedactionItem } from '@embedpdf/plugin-redaction';
import type { MenuWrapperProps } from '@embedpdf/utils/vue';
import type { Rect } from '@embedpdf/models';

interface RedactionSelectionMenuProps {
  menuWrapperProps: MenuWrapperProps;
  item: RedactionItem;
  rect: Rect;
}

const props = defineProps<RedactionSelectionMenuProps>();

const { provides: redaction } = useRedactionCapability();

const handleDelete = (e: Event) => {
  e.stopPropagation();
  const api = redaction.value;
  if (!api) return;
  const { page, id } = props.item;
  api.removePending(page, id);
};

const handleCommit = (e: Event) => {
  e.stopPropagation();
  const api = redaction.value;
  if (!api) return;
  const { page, id } = props.item;
  api.commitPending(page, id);
};
</script>

<template>
  <span v-bind="menuWrapperProps">
    <q-card
      flat
      bordered
      class="menu-card q-pa-xs"
      :style="{
        position: 'absolute',
        top: `${rect.size.height + 8}px`,
        left: '0',
        zIndex: 1000,
        cursor: 'default',
        pointerEvents: 'auto',
      }"
    >
      <div class="row items-center q-gutter-xs">
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="mdi-delete-outline"
          @click="handleDelete"
          aria-label="Delete redaction"
        />
        <q-btn
          flat
          round
          dense
          size="sm"
          icon="mdi-check"
          @click="handleCommit"
          aria-label="Commit redaction"
        />
      </div>
    </q-card>
  </span>
</template>

<style scoped>
.menu-card {
  min-width: 80px;
}
</style>
