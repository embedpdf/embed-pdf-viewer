<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { DocumentHandle } from '@cloudpdf/engine';

const props = defineProps<{ doc: DocumentHandle; pageNumber: number }>();
const src = ref<string>();

onMounted(async () => {
  const { pages } = await props.doc.pages.list();
  const page = pages[props.pageNumber - 1];
  const image = await props.doc
    .page(page.pageObjectNumber)
    .render.image({ viewport: { kind: 'scale', scale: 1.5 } });
  src.value = (await image.objectUrl()).url;
});
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="`Page ${pageNumber}`"
    style="max-width: 100%; border: 1px solid #e6eaf2; border-radius: 8px"
  />
  <p v-else>Rendering page…</p>
</template>
