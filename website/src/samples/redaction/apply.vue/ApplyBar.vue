<script setup lang="ts">
import { ref, watch } from 'vue';
import { saveFile, useDocuments } from '@embedpdf/vue/runtime';
import { useAnnotationState } from '@embedpdf/vue/annotation';
import { useRedaction, useRedactionState } from '@embedpdf/vue/redaction';

// The cover's title, in page coordinates: the shapes drawn over it go with it.
const TITLE = { x: 100, y: 212, width: 392, height: 156 };

const redaction = useRedaction();
const documents = useDocuments();
const { pendingCount, applying, lastResult } = useRedactionState();
const ready = useAnnotationState((state) => state.status === 'ready');
const asking = ref(false);

// On load: the title marked.
let started = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || started) return;
    started = true;
    void redaction.markArea(0, TITLE);
  },
  { immediate: true },
);

const marks = (count: number) => `${count} ${count === 1 ? 'mark' : 'marks'}`;

// The question, with the other annotations applying removes too: they could show what was there.
// Read as the template renders, so it follows the marks.
function question() {
  const { count } = redaction.estimateCollateral();
  const collateral =
    count > 0 ? `${count} ${count === 1 ? 'annotation' : 'annotations'} under them go too. ` : '';
  return `Redact ${marks(pendingCount.value)}? ${collateral}This can’t be undone.`;
}

function redactForGood() {
  void redaction.applyAll().finally(() => {
    asking.value = false;
  });
}

async function download() {
  const bytes = await documents.download(undefined, { mode: 'rewrite' });
  saveFile(bytes, 'redacted.pdf', 'application/pdf');
}
</script>

<template>
  <div v-if="asking" class="toolbar confirm" role="alertdialog" aria-label="Redact for good?">
    <span class="readout">{{ question() }}</span>
    <span class="spacer" />
    <button type="button" class="button" @click="asking = false">Cancel</button>
    <button type="button" class="button danger" :disabled="applying" @click="redactForGood">
      Redact for good
    </button>
  </div>
  <div v-else class="toolbar">
    <button
      type="button"
      class="button danger"
      :disabled="!pendingCount || !redaction.canApply()"
      @click="asking = true"
    >
      Redact…
    </button>
    <button
      type="button"
      class="button"
      :disabled="!lastResult"
      title="A fresh file, without the earlier revision that still holds the content"
      @click="download"
    >
      Download
    </button>
    <span class="spacer" />
    <output class="readout">
      {{
        lastResult
          ? `Gone for good, with ${lastResult.removedAnnotationCount} other annotations`
          : `${marks(pendingCount)} waiting`
      }}
    </output>
  </div>
</template>
