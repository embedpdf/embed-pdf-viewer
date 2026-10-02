<!-- Every change, once the engine has saved it, newest first. -->
<script setup lang="ts">
import { ref } from 'vue';
import { useAnnotationEvent } from '@embedpdf/vue/annotation';

interface Entry {
  id: number;
  text: string;
  origin: string;
}

const entries = ref<Entry[]>([]);
let nextId = 0;
const log = (text: string, origin: string) => {
  entries.value = [{ id: nextId++, text, origin }, ...entries.value].slice(0, 30);
};

useAnnotationEvent(
  (annotation) => annotation.onCreated,
  ({ annotation, origin }) =>
    log(`${annotation.author ?? 'Someone'} added a ${annotation.subtype}`, origin.kind),
);
useAnnotationEvent(
  (annotation) => annotation.onUpdated,
  ({ annotation, origin }) => log(`Changed a ${annotation.subtype}`, origin.kind),
);
useAnnotationEvent(
  (annotation) => annotation.onDeleted,
  ({ refs, origin }) =>
    log(
      `Deleted ${refs.length === 1 ? 'one annotation' : `${refs.length} annotations`}`,
      origin.kind,
    ),
);
useAnnotationEvent(
  (annotation) => annotation.onMoved,
  ({ refs, toIndex, origin }) =>
    log(`Moved ${refs.length} to position ${toIndex + 1}`, origin.kind),
);
</script>

<template>
  <ol class="panel log">
    <li v-if="entries.length === 0" class="empty">Nothing yet</li>
    <li v-for="entry in entries" :key="entry.id" class="entry">
      <span>{{ entry.text }}</span>
      <span class="origin">{{ entry.origin }}</span>
    </li>
  </ol>
</template>
