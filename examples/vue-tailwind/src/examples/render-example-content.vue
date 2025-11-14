<script setup lang="ts">
import { ref, computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer, useRenderCapability } from '@embedpdf/plugin-render/vue';

const props = defineProps<{
  documentId: string;
}>();

const { provides: renderCapability } = useRenderCapability();
const render = computed(() => renderCapability.value?.forDocument(props.documentId));
const isExporting = ref(false);

const exportPageAsPng = () => {
  if (!render.value || isExporting.value) return;
  isExporting.value = true;

  const renderTask = render.value.renderPage({
    pageIndex: 0,
    options: { scaleFactor: 2.0, withAnnotations: true, imageType: 'image/png' },
  });

  renderTask.wait(
    (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'page-1.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      isExporting.value = false;
    },
    () => {
      isExporting.value = false;
    },
  );
};
</script>

<template>
  <div style="height: 500px">
    <div class="flex h-full flex-col">
      <div
        class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <button
          @click="exportPageAsPng"
          :disabled="!render || isExporting"
          class="rounded-md bg-blue-500 px-3 py-1 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {{ isExporting ? 'Exporting...' : 'Export Page 1 as PNG (2x Res)' }}
        </button>
      </div>
      <div class="relative flex w-full flex-1 overflow-hidden">
        <Viewport :document-id="documentId" class="flex-grow bg-gray-100">
          <Scroller :document-id="documentId">
            <template #default="{ page }">
              <div
                :style="{
                  width: page.width + 'px',
                  height: page.height + 'px',
                  position: 'relative',
                }"
              >
                <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </div>
    </div>
  </div>
</template>
