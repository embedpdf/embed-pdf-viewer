<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { isPluginError, useDocuments } from '@embedpdf/vue/runtime';

const documents = useDocuments();
// What the last try did: the bytes it got, or why it was refused.
const result = ref<
  { downloaded: number } | { code: string; permission: string | null } | null
>(null);

async function download() {
  try {
    const bytes = await documents.download();
    result.value = { downloaded: bytes.byteLength };
  } catch (error) {
    if (isPluginError(error, 'permission-denied')) {
      result.value = { code: error.code, permission: error.permission };
    }
  }
}

// On load, the call the button makes, so the refusal shows at once.
onMounted(() => {
  void download();
});
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="download">Download anyway</button>
    <output class="result">
      <template v-if="result && 'downloaded' in result">
        Downloaded {{ result.downloaded }} bytes.
      </template>
      <template v-else-if="result">
        Refused: <code>{{ result.code }}</code>, missing <code>{{ result.permission }}</code>
      </template>
    </output>
  </div>
</template>
