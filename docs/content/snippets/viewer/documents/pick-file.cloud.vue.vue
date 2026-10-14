<script setup lang="ts">
import { computed, ref } from 'vue';
import { PDFViewer } from '@cloudpdf/viewer-vue';
import { fetchDocumentToken } from './api'; // your backend: a token for this user and document

const props = defineProps<{ contracts: { id: string; name: string }[] }>();
const id = ref(props.contracts[0]?.id);
// A new src opens the picked document; the same one keeps it open.
const src = computed(() => {
  const picked = id.value;
  return picked ? { token: () => fetchDocumentToken(picked) } : null;
});
</script>

<template>
  <select v-model="id">
    <option v-for="contract in contracts" :key="contract.id" :value="contract.id">
      {{ contract.name }}
    </option>
  </select>
  <PDFViewer :src="src" style="height: 80vh" />
</template>
