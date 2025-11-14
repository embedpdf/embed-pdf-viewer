<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { MarqueeCapture, useCapture, type CaptureAreaEvent } from '@embedpdf/plugin-capture/vue';

const props = defineProps<{
  documentId: string;
}>();

const { provides: capture, state } = useCapture(() => props.documentId);
const captureResult = ref<CaptureAreaEvent | null>(null);
const imageUrl = ref<string | null>(null);

let unsubscribeCapture: (() => void) | undefined;

onMounted(() => {
  if (!capture.value) return;
  unsubscribeCapture = capture.value.onCaptureArea((result) => {
    captureResult.value = result;
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
    imageUrl.value = URL.createObjectURL(result.blob);
  });
});

onUnmounted(() => {
  unsubscribeCapture?.();
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
});

const downloadImage = () => {
  if (!imageUrl.value || !captureResult.value) return;
  const a = document.createElement('a');
  a.href = imageUrl.value;
  a.download = `capture-page-${captureResult.value.pageIndex + 1}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
</script>

<template>
  <div style="height: 500px; display: flex; flex-direction: column">
    <div
      class="mb-4 mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
    >
      <button
        @click="capture?.toggleMarqueeCapture()"
        :class="[
          'rounded-md px-3 py-1 text-sm font-medium transition-colors',
          state.isMarqueeCaptureActive ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200',
        ]"
      >
        {{ state.isMarqueeCaptureActive ? 'Cancel Capture' : 'Capture Area' }}
      </button>
    </div>
    <div class="flex-grow" style="position: relative; overflow: hidden">
      <Viewport
        :document-id="documentId"
        style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #f1f3f5"
      >
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer :document-id="documentId" :page-index="page.pageIndex" :scale="1" />
              <MarqueeCapture :document-id="documentId" :page-index="page.pageIndex" />
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
  <div
    v-if="!captureResult || !imageUrl"
    class="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center"
  >
    <p class="text-sm text-gray-500">
      Click "Capture Area" and drag a rectangle on the PDF to create a snapshot.
    </p>
  </div>
  <div v-else class="mt-4 rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
    <h3 class="text-md font-medium text-gray-800">Capture Result</h3>
    <p class="text-sm text-gray-500">
      Captured from page {{ captureResult.pageIndex + 1 }} at {{ captureResult.scale }}x resolution.
    </p>
    <img
      :src="imageUrl"
      alt="Captured area from PDF"
      class="mt-2 max-w-full rounded border border-gray-200"
    />
    <button
      @click="downloadImage"
      class="mt-3 rounded-md bg-blue-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-blue-600"
    >
      Download Image
    </button>
  </div>
</template>
