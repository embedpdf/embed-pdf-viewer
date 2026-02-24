<script setup lang="ts">
import { ref, watch } from 'vue';
import { useDocumentManagerCapability, useDocumentManagerPlugin } from '../hooks';
import type { Task } from '@embedpdf/models';
import type { PdfErrorReason } from '@embedpdf/models';
import type {
  OpenDocumentResponse,
  OpenFileDialogOptions,
} from '@embedpdf/plugin-document-manager';

const { plugin } = useDocumentManagerPlugin();
const { provides } = useDocumentManagerCapability();
const inputRef = ref<HTMLInputElement | null>(null);
const taskRef = ref<Task<OpenDocumentResponse, PdfErrorReason> | null>(null);
const optionsRef = ref<OpenFileDialogOptions | undefined>(undefined);

watch(
  plugin,
  (pluginValue, _, onCleanup) => {
    if (!pluginValue?.onOpenFileRequest) return;

    const unsubscribe = pluginValue.onOpenFileRequest(({ task, options }) => {
      taskRef.value = task;
      optionsRef.value = options;
      inputRef.value?.click();
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);

const onChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  const cap = provides.value;
  if (!file || !cap) return;

  const buffer = await file.arrayBuffer();
  const openTask = cap.openDocumentBuffer({
    name: file.name,
    buffer,
    documentId: optionsRef.value?.documentId,
    scale: optionsRef.value?.scale,
    rotation: optionsRef.value?.rotation,
    autoActivate: optionsRef.value?.autoActivate,
  });

  openTask.wait(
    (result) => {
      taskRef.value?.resolve(result);
    },
    (error) => {
      taskRef.value?.fail(error);
    },
  );
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
