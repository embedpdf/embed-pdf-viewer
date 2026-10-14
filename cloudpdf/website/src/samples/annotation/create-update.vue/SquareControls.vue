<!-- Create a rectangle, then change, move and delete it, all from code. -->
<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationList, useAnnotationState } from '@embedpdf/vue/annotation';
import type { AnnotationRef } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const ready = useAnnotationState((state) => state.status === 'ready');
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);
const squareRef = shallowRef<AnnotationRef | null>(null);
const annotations = useAnnotationList(); // follows the annotations as they change, for the reads below

const square = computed(() => {
  void annotations.value; // read again whenever the annotations change
  return squareRef.value ? annotation.get(squareRef.value) : null;
});
const canUpdate = computed(() => square.value !== null && annotation.canUpdate(square.value.ref));
const canDelete = computed(() => square.value !== null && annotation.canDelete(square.value.ref));
const status = computed(() => {
  if (!square.value) return 'No rectangle';
  return annotation.isPending(square.value.ref) ? 'Saving…' : 'Saved';
});

async function add() {
  if (!cover.value) return;
  const { annotation: made } = await annotation.create(cover.value, {
    subtype: 'square',
    box: { x: 72, y: 592, width: 200, height: 100 },
    color: '#0078ff',
    strokeWidth: 3,
  });
  squareRef.value = made.ref;
}

// On load: one rectangle, to change.
let started = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || started) return;
    started = true;
    void add();
  },
  { immediate: true },
);

function makeRed() {
  if (square.value) void annotation.update(square.value.ref, { color: '#dc143c' });
}

function moveRight() {
  if (!square.value) return;
  const { rect } = square.value;
  void annotation.update(square.value.ref, { rect: { ...rect, x: rect.x + 40 } }); // 40 points right
}

function turn() {
  if (square.value) void annotation.update(square.value.ref, { rotation: 90 });
}

function remove() {
  if (!square.value) return;
  void annotation.delete(square.value.ref);
  squareRef.value = null;
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="square !== null" @click="add">Create</button>
    <button type="button" class="button" :disabled="!canUpdate" @click="makeRed">
      Make it red
    </button>
    <button type="button" class="button" :disabled="!canUpdate" @click="moveRight">
      Move right
    </button>
    <button type="button" class="button" :disabled="!canUpdate" @click="turn">Turn to 90°</button>
    <button type="button" class="button" :disabled="!canDelete" @click="remove">Delete</button>
    <span class="spacer" />
    <output class="readout">{{ status }}</output>
  </div>
</template>
