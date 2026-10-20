<script setup lang="ts">
import { displayNameOf, useAttachment, useAttachmentState } from '@embedpdf/vue/attachment';
import type { AttachedFile } from '@embedpdf/vue/attachment';
import { saveFile } from '@embedpdf/vue/runtime';

const attachment = useAttachment();
const { files, canDownload } = useAttachmentState();

async function save(file: AttachedFile) {
  const { bytes, name, mimeType } = await attachment.download(file);
  saveFile(bytes, name, mimeType ?? undefined);
}
</script>

<template>
  <ul>
    <li v-for="file in files" :key="file.id">
      <bdi>{{ displayNameOf(file) }}</bdi>
      <button :disabled="!canDownload" @click="save(file)">Save</button>
    </li>
  </ul>
</template>
