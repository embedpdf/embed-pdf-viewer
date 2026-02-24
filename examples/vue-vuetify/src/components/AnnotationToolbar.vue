<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotation } from '@embedpdf/plugin-annotation/vue';

interface AnnotationToolbarProps {
  documentId: string;
}

const props = defineProps<AnnotationToolbarProps>();

const { provides, state } = useAnnotation(() => props.documentId);

const activeToolId = computed(() => state.value.activeToolId);

const handleFreeTextAnnotation = () => {
  const currentId = activeToolId.value;
  provides.value?.setActiveTool(currentId === 'freeText' ? null : 'freeText');
};

const handleInkAnnotation = () => {
  const currentId = activeToolId.value;
  provides.value?.setActiveTool(currentId === 'ink' ? null : 'ink');
};

const handleCircleAnnotation = () => {
  const currentId = activeToolId.value;
  provides.value?.setActiveTool(currentId === 'circle' ? null : 'circle');
};

const handleSquareAnnotation = () => {
  const currentId = activeToolId.value;
  provides.value?.setActiveTool(currentId === 'square' ? null : 'square');
};

const handleLineArrowAnnotation = () => {
  const currentId = activeToolId.value;
  provides.value?.setActiveTool(currentId === 'lineArrow' ? null : 'lineArrow');
};

const handleStampApprovedAnnotation = () => {
  const currentId = activeToolId.value;
  provides.value?.setActiveTool(currentId === 'stampApproved' ? null : 'stampApproved');
};
</script>

<template>
  <v-app-bar elevation="0" density="compact" color="surface" class="annotation-toolbar">
    <v-toolbar density="compact">
      <v-spacer></v-spacer>
      <v-btn
        :color="activeToolId === 'freeText' ? 'primary' : undefined"
        :variant="activeToolId === 'freeText' ? 'tonal' : 'text'"
        @click="handleFreeTextAnnotation"
        icon="mdi-format-text"
        size="small"
        class="mx-1"
      />
      <v-btn
        :color="activeToolId === 'ink' ? 'primary' : undefined"
        :variant="activeToolId === 'ink' ? 'tonal' : 'text'"
        @click="handleInkAnnotation"
        icon="mdi-gesture"
        size="small"
        class="mx-1"
      />
      <v-btn
        :color="activeToolId === 'circle' ? 'primary' : undefined"
        :variant="activeToolId === 'circle' ? 'tonal' : 'text'"
        @click="handleCircleAnnotation"
        icon="mdi-circle-outline"
        size="small"
        class="mx-1"
      />
      <v-btn
        :color="activeToolId === 'square' ? 'primary' : undefined"
        :variant="activeToolId === 'square' ? 'tonal' : 'text'"
        @click="handleSquareAnnotation"
        icon="mdi-square-outline"
        size="small"
        class="mx-1"
      />
      <v-btn
        :color="activeToolId === 'lineArrow' ? 'primary' : undefined"
        :variant="activeToolId === 'lineArrow' ? 'tonal' : 'text'"
        @click="handleLineArrowAnnotation"
        icon="mdi-arrow-top-right"
        size="small"
        class="mx-1"
      />
      <v-btn
        :color="activeToolId === 'stampApproved' ? 'primary' : undefined"
        :variant="activeToolId === 'stampApproved' ? 'tonal' : 'text'"
        @click="handleStampApprovedAnnotation"
        icon="mdi-check-circle-outline"
        size="small"
        class="mx-1"
      />
      <v-spacer></v-spacer>
    </v-toolbar>
  </v-app-bar>
</template>

<style scoped>
.annotation-toolbar {
  border-bottom: 1px solid #cfd4da;
}
</style>
