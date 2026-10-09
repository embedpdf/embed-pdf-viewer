<script setup lang="ts">
import { useAnnotation, type CommentThread } from '@embedpdf/vue/annotation';
import { useStage } from '@embedpdf/vue/stage';

const { thread } = defineProps<{ thread: CommentThread }>();

const stage = useStage();
const annotation = useAnnotation();

function show() {
  stage.reveal(thread.page, { rect: thread.root.rect });
  annotation.selection.set([thread.root.ref]); // and select it
}
</script>

<template>
  <button @click="show">Show</button>
</template>
