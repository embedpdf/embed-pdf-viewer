<script setup lang="ts">
import { useStage } from '@embedpdf/vue/stage';
import { annotationKey } from '@embedpdf/vue/annotation';
import { usePendingRedactions, useRedaction, useRedactionState } from '@embedpdf/vue/redaction';

const stage = useStage();
const redaction = useRedaction();
const marks = usePendingRedactions(); // the marks not applied yet, in page order
const { pendingCount } = useRedactionState();
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <span class="readout">{{ pendingCount }} {{ pendingCount === 1 ? 'mark' : 'marks' }}</span>
      <button
        type="button"
        class="button"
        :disabled="!pendingCount"
        @click="redaction.clearPending()"
      >
        Remove all
      </button>
    </div>
    <ul class="marks">
      <li v-for="mark in marks" :key="annotationKey(mark.ref)" class="mark">
        <button
          type="button"
          class="mark-go"
          @click="stage.reveal(mark.page, { rect: mark.bounds })"
        >
          <span class="mark-page">Page {{ mark.pageIndex + 1 }}</span>
          <span class="mark-kind">{{ mark.kind === 'text' ? 'Text' : 'Area' }}</span>
        </button>
        <button
          type="button"
          class="button"
          :disabled="!redaction.canUnmark(mark.ref)"
          @click="redaction.unmark([mark.ref])"
        >
          Remove
        </button>
      </li>
    </ul>
  </div>
</template>
