<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotationState } from '@embedpdf/vue/annotation';
import { usePendingRedactions, useRedaction, useRedactionState } from '@embedpdf/vue/redaction';

// The cover's subtitle, in page coordinates.
const SUBTITLE = { x: 100, y: 378, width: 352, height: 114 };

const redaction = useRedaction();
const stage = useStage();
const { applying, lastResult } = useRedactionState();
const pending = usePendingRedactions();
const mark = computed(() => pending.value[0]);
const ready = useAnnotationState((state) => state.status === 'ready');
const text = ref('Classified');

// On load: the subtitle marked, with a label that fills the area.
let started = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || started) return;
    started = true;
    void redaction
      .markArea(0, SUBTITLE)
      .then(({ mark: made }) =>
        redaction.updateLabel(made.ref, { overlayText: 'Classified', repeat: true }),
      )
      .then(() => stage.reveal(0, { rect: SUBTITLE }));
  },
  { immediate: true },
);

function setLabel() {
  if (!mark.value) return;
  void redaction.updateLabel(mark.value.ref, { overlayText: text.value.trim() || null });
}

function setRepeat(event: Event) {
  const repeat = (event.target as HTMLInputElement).checked;
  if (mark.value) void redaction.updateLabel(mark.value.ref, { repeat });
}
</script>

<template>
  <div class="toolbar">
    <form class="label-form" @submit.prevent="setLabel">
      <input v-model="text" class="field" aria-label="Label" :disabled="!mark" />
      <button type="submit" class="button" :disabled="!mark">Set label</button>
    </form>
    <label class="label">
      <input
        type="checkbox"
        :checked="mark?.repeat ?? false"
        :disabled="!mark"
        @change="setRepeat"
      />
      Repeat
    </label>
    <button
      type="button"
      class="button danger"
      :disabled="!mark || applying"
      @click="redaction.applyAll()"
    >
      Redact
    </button>
    <span class="spacer" />
    <output class="readout">
      {{ lastResult ? 'The label is part of the page now' : 'Redact to see the label' }}
    </output>
  </div>
</template>
