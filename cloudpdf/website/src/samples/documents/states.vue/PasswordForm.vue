<script setup lang="ts">
import { ref } from 'vue';
import { useDocuments } from '@embedpdf/vue/runtime';
import type { DocumentInfo } from '@embedpdf/vue/runtime';

const props = defineProps<{ document: DocumentInfo }>();

const documents = useDocuments();
const password = ref('');
const wrong = ref(props.document.passwordProvided ?? false);

async function unlock() {
  try {
    await documents.unlock(props.document.id, { password: password.value });
  } catch {
    wrong.value = true; // it stays locked; ask again
  }
}
</script>

<template>
  <div class="panel">
    <h3>{{ document.name }} needs a password</h3>
    <p v-if="wrong">That password isn’t right. Try again.</p>
    <div class="actions">
      <input v-model="password" class="field" type="password" aria-label="Password" />
      <button type="button" class="button" @click="unlock">Unlock</button>
    </div>
  </div>
</template>
