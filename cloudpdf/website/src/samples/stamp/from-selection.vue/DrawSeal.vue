<!-- On load: a framed text stamp in the cover's empty corner, both parts selected, scrolled into view. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// An empty corner of the cover, in page coordinates.
const CORNER = { x: 70, y: 600, width: 190, height: 64 };

const annotation = useAnnotation();
const stage = useStage();
const ready = useAnnotationState((state) => state.status === 'ready');

let drawn = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || drawn) return;
    drawn = true;
    void Promise.all([
      annotation.create(0, { subtype: 'square', box: CORNER, color: '#c4262e', strokeWidth: 4 }),
      annotation.create(0, {
        subtype: 'free-text',
        intent: 'free-text',
        box: CORNER,
        contents: 'CHECKED',
        fontFamily: 'helvetica-bold',
        fontSize: 30,
        textAlign: 'center',
        verticalAlign: 'middle',
        fontColor: '#c4262e',
        strokeWidth: 0,
      }),
    ]).then((created) => {
      annotation.selection.set(created.map((made) => made.annotation.ref));
      stage.reveal(0, { rect: CORNER });
    });
  },
  { immediate: true },
);
</script>

<template></template>
