<script setup lang="ts">
import { ref, computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer, useRenderCapability } from '@embedpdf/plugin-render/vue';
import { Loader2, Image, Download } from 'lucide-vue-next';

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
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Toolbar -->
    <div
      class="flex items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        @click="exportPageAsPng"
        :disabled="!render || isExporting"
        class="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Loader2 v-if="isExporting" :size="16" class="animate-spin" />
        <Image v-else :size="16" />
        {{ isExporting ? 'Exporting...' : 'Export Page 1 as PNG' }}
      </button>
      <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <Download :size="14" />
        <span class="hidden sm:inline">Renders at 2x resolution with annotations</span>
        <span class="sm:hidden">2x resolution</span>
      </div>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[400px] sm:h-[500px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
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
</template>
