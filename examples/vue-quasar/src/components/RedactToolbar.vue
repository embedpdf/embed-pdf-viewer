<script setup lang="ts">
import { RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/vue';

const { provides, state } = useRedaction();

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
  <div class="redact-toolbar text-dark bg-white">
    <q-toolbar dense class="q-px-md q-gutter-sm justify-center">
      <q-btn
        flat
        round
        dense
        icon="mdi-format-text-variant"
        :color="state.activeType === RedactionMode.RedactSelection ? 'primary' : undefined"
        @click="handleTextRedact"
      >
        <q-tooltip>Redact Text</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="mdi-selection-drag"
        :color="state.activeType === RedactionMode.MarqueeRedact ? 'primary' : undefined"
        @click="handleAreaRedact"
      >
        <q-tooltip>Marquee Redact</q-tooltip>
      </q-btn>
      <q-separator spaced vertical />
      <q-btn
        flat
        round
        dense
        icon="mdi-check"
        :disable="state.pendingCount === 0"
        @click="handleCommitPending"
      >
        <q-tooltip>Apply Pending Redactions</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        icon="mdi-close"
        :disable="state.pendingCount === 0"
        @click="handleClearPending"
      >
        <q-tooltip>Clear Pending Redactions</q-tooltip>
      </q-btn>
    </q-toolbar>
  </div>
</template>

<style scoped>
.redact-toolbar {
  border-bottom: 1px solid #cfd4da;
}
</style>
