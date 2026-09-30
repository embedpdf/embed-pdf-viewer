<script setup lang="ts">
import { useInteraction } from '@embedpdf/vue/interaction';
import { useRedaction, useRedactionState } from '@embedpdf/vue/redaction';

const interaction = useInteraction();
const redaction = useRedaction();
const { pendingCount, applying } = useRedactionState();
</script>

<template>
  <button @click="interaction.activateTool('redact')">Mark for redaction</button>
  <button :disabled="!pendingCount || applying" @click="redaction.applyAll()">
    Redact {{ pendingCount }} marks
  </button>
</template>
