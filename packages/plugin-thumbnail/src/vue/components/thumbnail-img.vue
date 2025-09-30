<script setup lang="ts">
import { onBeforeUnmount, ref, watch, watchEffect, useAttrs } from 'vue';
import { useThumbnailCapability, useThumbnailPlugin } from '../hooks';
import type { ThumbMeta } from '@embedpdf/plugin-thumbnail';
import { ignore, PdfErrorCode } from '@embedpdf/models';

const props = defineProps<{ meta: ThumbMeta }>();
const attrs = useAttrs();

const { provides: thumbs } = useThumbnailCapability();
const { plugin: thumbnailPlugin } = useThumbnailPlugin();

const url = ref<string | null>(null);
let urlToRevoke: string | null = null;
const refreshTick = ref(0);

let offRefresh: (() => void) | null = null;

watchEffect((onCleanup) => {
  if (!thumbnailPlugin.value) return;
  offRefresh?.();
  offRefresh = thumbnailPlugin.value.onRefreshPages((pages) => {
    if (pages.includes(props.meta.pageIndex)) {
      refreshTick.value++;
    }
  });
  onCleanup(() => offRefresh?.());
});

function revoke() {
  if (urlToRevoke) {
    URL.revokeObjectURL(urlToRevoke);
    urlToRevoke = null;
  }
}

let abortTask: (() => void) | null = null;

function load() {
  if (!thumbs.value) return; // wait until capability exists

  const task = thumbs.value.renderThumb(props.meta.pageIndex, window.devicePixelRatio);
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
  }, ignore);
}

/* 🔧 Re-run when:
   - page changes,
   - the plugin tells us to refresh,
   - OR the capability becomes available later.
*/
watch(
  () => [props.meta.pageIndex, refreshTick.value, !!thumbs.value],
  () => {
    abortTask?.();
    load();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  abortTask?.();
  revoke();
});
</script>

<template>
  <img v-if="url" :src="url" v-bind="attrs" @load="revoke" />
</template>
