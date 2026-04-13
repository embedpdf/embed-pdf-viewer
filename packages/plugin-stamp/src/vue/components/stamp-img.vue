<script setup lang="ts">
import { ref, watch } from 'vue';
import { useStampCapability } from '../hooks';
import { ignore, PdfErrorCode } from '@embedpdf/models';

interface StampImgProps {
  libraryId: string;
  pageIndex: number;
  width: number;
  dpr?: number;
}

const props = defineProps<StampImgProps>();

const { provides } = useStampCapability();

const url = ref<string | null>(null);
let urlToRevoke: string | null = null;

function revoke() {
  if (urlToRevoke) {
    URL.revokeObjectURL(urlToRevoke);
    urlToRevoke = null;
  }
}

let abortTask: (() => void) | null = null;

watch(
  [
    () => provides.value,
    () => props.libraryId,
    () => props.pageIndex,
    () => props.width,
    () => props.dpr,
  ],
  ([capability, libraryId, pageIndex, width, dpr], _, onCleanup) => {
    if (abortTask) {
      abortTask();
      abortTask = null;
    }

    if (!capability) {
      url.value = null;
      return;
    }

    const task = capability.renderStamp(
      libraryId,
      pageIndex,
      width,
      dpr ?? window.devicePixelRatio,
    );

    abortTask = () =>
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled stamp render task',
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
