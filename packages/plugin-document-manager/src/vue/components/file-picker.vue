<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useDocumentManagerCapability, useDocumentManagerPlugin } from '../hooks';

const { provides } = useDocumentManagerCapability();
const { plugin } = useDocumentManagerPlugin();
const inputRef = ref<HTMLInputElement | null>(null);
let unsub: (() => void) | undefined;

onMounted(() => {
  if (!plugin?.value?.onOpenFileRequest) return;
  unsub = plugin.value.onOpenFileRequest((req) => {
    if (req === 'open') inputRef.value?.click();
  });
});
onUnmounted(() => unsub?.());

const onChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  const cap = provides.value;
  if (!file || !cap) return;
  const buffer = await file.arrayBuffer();
  cap.openDocumentBuffer({ name: file.name, buffer });
};
</script>

<template>
  <input
    ref="inputRef"
    type="file"
    accept="application/pdf"
    style="display: none"
    @change="onChange"
  />
</template>
