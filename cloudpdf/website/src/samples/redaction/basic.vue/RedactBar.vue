<script setup lang="ts">
import { computed, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useAnnotationState } from '@embedpdf/vue/annotation';
import { useRedaction, useRedactionState } from '@embedpdf/vue/redaction';

// The cover's subtitle, in page coordinates.
const SUBTITLE = { x: 44, y: 318, width: 206, height: 50 };

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const stage = useStage();
const redaction = useRedaction();
const { pendingCount, applying } = useRedactionState();
const ready = useAnnotationState((state) => state.status === 'ready');

// On load: the cover's subtitle marked, and the redact tool on.
let started = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || started) return;
    started = true;
    void redaction.markArea(0, SUBTITLE).then(() => stage.reveal(0, { rect: SUBTITLE }));
    interaction.activateTool('redact');
  },
  { immediate: true },
);

const marking = computed(() => activeToolId.value === 'redact');
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :aria-pressed="marking"
      @click="interaction.activateTool(marking ? 'pointer' : 'redact')"
    >
      Mark for redaction
    </button>
    <button
      type="button"
      class="button danger"
      :disabled="!pendingCount || applying"
      @click="redaction.applyAll()"
    >
      Redact {{ pendingCount }} {{ pendingCount === 1 ? 'mark' : 'marks' }}
    </button>
    <span class="spacer" />
    <output class="readout">
      {{ marking ? 'Select text, or drag over an area' : 'Click a mark to move it' }}
    </output>
  </div>
</template>
