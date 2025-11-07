<script setup lang="ts">
import { RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/vue';

interface RedactToolbarProps {
  documentId: string;
}

const props = defineProps<RedactToolbarProps>();

const { provides, state } = useRedaction(() => props.documentId);

const handleTextRedact = () => {
  provides?.value?.toggleRedactSelection();
};

const handleAreaRedact = () => {
  provides?.value?.toggleMarqueeRedact();
};

const handleCommitPending = () => {
  provides?.value?.commitAllPending();
};

const handleClearPending = () => {
  provides?.value?.clearPending();
};
</script>

<template>
  <v-app-bar elevation="0" density="compact" color="surface" class="redact-toolbar">
    <v-toolbar density="compact">
      <v-spacer></v-spacer>
      <v-btn
        :color="state.activeType === RedactionMode.RedactSelection ? 'primary' : undefined"
        :variant="state.activeType === RedactionMode.RedactSelection ? 'tonal' : 'text'"
        @click="handleTextRedact"
        icon="mdi-format-text-variant"
        size="small"
        class="mx-1"
      />
      <v-btn
        :color="state.activeType === RedactionMode.MarqueeRedact ? 'primary' : undefined"
        :variant="state.activeType === RedactionMode.MarqueeRedact ? 'tonal' : 'text'"
        @click="handleAreaRedact"
        icon="mdi-selection-drag"
        size="small"
        class="mx-1"
      />
      <v-divider vertical class="mx-2" />
      <v-btn
        :disabled="state.pendingCount === 0"
        @click="handleCommitPending"
        icon="mdi-check"
        size="small"
        class="mx-1"
      />
      <v-btn
        :disabled="state.pendingCount === 0"
        @click="handleClearPending"
        icon="mdi-close"
        size="small"
        class="mx-1"
      />
      <v-spacer></v-spacer>
    </v-toolbar>
  </v-app-bar>
</template>

<style scoped>
.redact-toolbar {
  border-bottom: 1px solid #cfd4da;
}
</style>
