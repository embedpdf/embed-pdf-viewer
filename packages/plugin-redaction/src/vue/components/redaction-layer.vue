<template>
  <PendingRedactions
    :document-id="documentId"
    :page-index="pageIndex"
    :scale="actualScale"
    :rotation="actualRotation"
    :bbox-stroke="bboxStroke"
    :selection-menu="selectionMenu"
  >
    <template #selection-menu="slotProps">
      <slot name="selection-menu" v-bind="slotProps" />
    </template>
  </PendingRedactions>
  <MarqueeRedact :document-id="documentId" :page-index="pageIndex" :scale="actualScale" />
  <SelectionRedact :document-id="documentId" :page-index="pageIndex" :scale="actualScale" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import { Rotation } from '@embedpdf/models';
import PendingRedactions from './pending-redactions.vue';
import MarqueeRedact from './marquee-redact.vue';
import SelectionRedact from './selection-redact.vue';
import { RedactionSelectionMenuRenderFn } from './types';

interface RedactionLayerProps {
  /** The ID of the document this layer belongs to */
  documentId: string;
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Current render scale for this page */
  scale?: number;
  /** Page rotation (for counter-rotating menus, etc.) */
  rotation?: Rotation;
  /** Optional bbox stroke color */
  bboxStroke?: string;
  /** Optional menu renderer for a selected redaction */
  selectionMenu?: RedactionSelectionMenuRenderFn;
}

const props = withDefaults(defineProps<RedactionLayerProps>(), {
  bboxStroke: 'rgba(0,0,0,0.8)',
});

const documentState = useDocumentState(() => props.documentId);
const page = computed(() => documentState.value?.document?.pages?.[props.pageIndex]);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

const actualRotation = computed(() => {
  if (props.rotation !== undefined) return props.rotation;
  // Combine page intrinsic rotation with document rotation
  const pageRotation = page.value?.rotation ?? 0;
  const docRotation = documentState.value?.rotation ?? 0;
  return ((pageRotation + docRotation) % 4) as Rotation;
});
</script>
