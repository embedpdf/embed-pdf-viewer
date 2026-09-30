<script setup lang="ts">
import { annotationKey } from '@embedpdf/vue/annotation';
import { usePendingRedactions, useRedaction } from '@embedpdf/vue/redaction';
import { useStage } from '@embedpdf/vue/stage';

const stage = useStage();
const redaction = useRedaction();
const marks = usePendingRedactions();
</script>

<template>
  <ul>
    <li v-for="mark in marks" :key="annotationKey(mark.ref)">
      <button @click="stage.reveal(mark.page, { rect: mark.bounds })">
        Page {{ mark.pageIndex + 1 }}: {{ mark.kind === 'text' ? 'text' : 'area' }}
      </button>
      <button @click="redaction.unmark([mark.ref])">Remove</button>
    </li>
  </ul>
</template>
