<script setup lang="ts">
import { ref } from 'vue';
import { useDocuments, type DocumentInfo } from '@embedpdf/vue/runtime';
import PasswordPrompt from './PasswordPrompt.vue';

const props = defineProps<{ document: DocumentInfo }>();
const documents = useDocuments();
const wrong = ref(false);

async function submit(password: string) {
  try {
    await documents.unlock(props.document.id, { password });
  } catch {
    wrong.value = true; // it stays locked; ask again
  }
}
</script>

<template>
  <PasswordPrompt :wrong="wrong" @submit="submit" />
</template>
