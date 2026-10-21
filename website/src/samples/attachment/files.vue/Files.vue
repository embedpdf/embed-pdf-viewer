<!-- The files the document carries: attach some, save one, remove one. -->
<script setup lang="ts">
import { saveFile } from '@embedpdf/vue/runtime';
import { displayNameOf, useAttachment, useAttachmentState } from '@embedpdf/vue/attachment';
import type { AttachedFile } from '@embedpdf/vue/attachment';

const attachment = useAttachment();
const { files, canAdd, canDownload } = useAttachmentState();

/** A file's size, as people read it. */
const sizeOf = (bytes: number | null) =>
  bytes === null ? '' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

async function save(file: AttachedFile) {
  const { bytes, name, mimeType } = await attachment.download(file);
  saveFile(bytes, name, mimeType ?? undefined);
}

function attach(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  input.value = '';
  if (picked.length > 0) void attachment.add(picked.map((data) => ({ data })));
}
</script>

<template>
  <aside class="files">
    <header class="files-header">
      <h3 class="files-title">Files</h3>
      <label class="button primary" :data-disabled="!canAdd || undefined">
        Attach
        <input type="file" multiple hidden :disabled="!canAdd" @change="attach" />
      </label>
    </header>
    <p v-if="files.length === 0" class="empty">Attach a file to carry it inside the document.</p>
    <ul v-else class="list">
      <li
        v-for="file in files"
        :key="file.id"
        class="row"
        :data-pending="attachment.isPending(file) || undefined"
      >
        <button type="button" class="row-name" :disabled="!canDownload" @click="save(file)">
          <bdi>{{ displayNameOf(file) }}</bdi>
          <span class="row-size">{{ sizeOf(file.size) }}</span>
        </button>
        <button
          type="button"
          class="row-remove"
          :aria-label="`Remove ${displayNameOf(file)}`"
          :disabled="!attachment.canRemove(file)"
          @click="attachment.remove(file)"
        >
          ×
        </button>
      </li>
    </ul>
  </aside>
</template>
