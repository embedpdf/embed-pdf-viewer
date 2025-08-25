<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useLoaderCapability } from '../hooks';

const { provides: loaderProvides } = useLoaderCapability();
const inputRef = ref<HTMLInputElement | null>(null);

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  const cap = loaderProvides.value;
  if (!cap) return;

  // Listen for "open file" requests
  unsubscribe = cap.onOpenFileRequest((req) => {
    if (req === 'open' && inputRef.value) {
      inputRef.value.click();
    }
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});

// Handle actual file selection
const onChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  const cap = loaderProvides.value;

  if (file && cap) {
    const arrayBuffer = await file.arrayBuffer();
    await cap.loadDocument({
      type: 'buffer',
      pdfFile: {
        id: Math.random().toString(36).substring(2, 15),
        name: file.name,
        content: arrayBuffer,
      },
    });
  }
};
</script>

<template>
  <!-- Hidden file picker -->
  <input
    ref="inputRef"
    type="file"
    accept="application/pdf"
    style="display: none"
    @change="onChange"
  />
</template>
