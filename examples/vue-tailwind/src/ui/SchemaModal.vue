<template>
  <component :is="modalContent" v-if="modalContent" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ModalSchema } from '@embedpdf/plugin-ui';
import { useItemRenderer } from '@embedpdf/plugin-ui/vue';

/**
 * Schema-driven Modal Renderer for Vue
 *
 * Renders modals defined in the UI schema.
 * Supports animation lifecycle via isOpen and onExited props.
 */

interface Props {
  schema: ModalSchema;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onExited: () => void;
}

const props = defineProps<Props>();

const { renderCustomComponent } = useItemRenderer();

const modalContent = computed(() => {
  const { content } = props.schema;

  if (content.type !== 'component') {
    console.warn(`SchemaModal only supports component content type, got: ${content.type}`);
    return null;
  }

  return renderCustomComponent(content.componentId, props.documentId, {
    isOpen: props.isOpen,
    onClose: props.onClose,
    onExited: props.onExited,
  });
});
</script>
