<script setup lang="ts">
import { ref, watch } from 'vue';
import { useThumbnailCapability, useThumbnailPlugin } from '../hooks';
import type { ThumbMeta } from '@embedpdf/plugin-thumbnail';
import { ignore, PdfErrorCode } from '@embedpdf/models';

interface ThumbImgProps {
  /**
   * The ID of the document that this thumbnail belongs to
   */
  documentId: string;
  meta: ThumbMeta;
}

const props = defineProps<ThumbImgProps>();

const { provides: thumbs } = useThumbnailCapability();
const { plugin: thumbnailPlugin } = useThumbnailPlugin();

const url = ref<string | null>(null);
let urlToRevoke: string | null = null;
const refreshTick = ref(0);

// Watch for refresh events for this specific document
watch(
  [() => thumbnailPlugin.value, () => props.documentId, () => props.meta.pageIndex],
  ([plugin, docId, pageIdx], _, onCleanup) => {
    if (!plugin) return;

    const scope = plugin.provides().forDocument(docId);
    const unsubscribe = scope.onRefreshPages((pages) => {
      if (pages.includes(pageIdx)) {
        refreshTick.value++;
      }
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);

function revoke() {
  if (urlToRevoke) {
    URL.revokeObjectURL(urlToRevoke);
    urlToRevoke = null;
  }
}

let abortTask: (() => void) | null = null;

// Render thumbnail when dependencies change
watch(
  [() => thumbs.value, () => props.documentId, () => props.meta.pageIndex, refreshTick],
  ([capability, docId, pageIdx], _, onCleanup) => {
    // Cancel previous task
    if (abortTask) {
      abortTask();
      abortTask = null;
    }

    if (!capability) {
      url.value = null;
      return;
    }

    const scope = capability.forDocument(docId);
    const task = scope.renderThumb(pageIdx, window.devicePixelRatio);

    abortTask = () =>
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });

    task.wait((blob) => {
      revoke();
      const objectUrl = URL.createObjectURL(blob);
      urlToRevoke = objectUrl;
      url.value = objectUrl;
      abortTask = null;
    }, ignore);

    onCleanup(() => {
      if (abortTask) {
        abortTask();
        abortTask = null;
      }
      revoke();
    });
  },
  { immediate: true },
);
</script>

<template>
  <img v-if="url" :src="url" v-bind="$attrs" @load="revoke" />
</template>
