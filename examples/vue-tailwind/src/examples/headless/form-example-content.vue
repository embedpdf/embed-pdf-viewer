<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useExport } from '@embedpdf/plugin-export/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { useZoom } from '@embedpdf/plugin-zoom/vue';
import { useFormCapability } from '@embedpdf/plugin-form/vue';
import { Download, ZoomIn, ZoomOut } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { provides: zoom } = useZoom(() => props.documentId);
const { provides: exportApi } = useExport(() => props.documentId);
const { provides: formCapability } = useFormCapability();
const formValues = ref<Record<string, string>>({});

let unsubscribeReady: (() => void) | undefined;
let unsubscribeChange: (() => void) | undefined;

onMounted(() => {
  const provides = formCapability.value;
  if (!provides) return;

  const scope = provides.forDocument(props.documentId);
  formValues.value = scope.getFormValues();

  unsubscribeReady = scope.onFormReady(() => {
    formValues.value = scope.getFormValues();
  });
  unsubscribeChange = scope.onFieldValueChange(() => {
    formValues.value = scope.getFormValues();
  });
});

onUnmounted(() => {
  unsubscribeReady?.();
  unsubscribeChange?.();
});
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          @click="zoom?.zoomOut()"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom Out"
        >
          <ZoomOut :size="16" />
        </button>

        <button
          type="button"
          @click="zoom?.zoomIn()"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
          title="Zoom In"
        >
          <ZoomIn :size="16" />
        </button>
      </div>

      <button
        type="button"
        @click="exportApi?.download()"
        :disabled="!exportApi"
        class="inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download :size="16" />
        Download PDF
      </button>
    </div>

    <div class="flex flex-col lg:h-[550px] lg:flex-row">
      <div class="relative h-[420px] sm:h-[550px] lg:h-auto lg:flex-1">
        <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
          <Scroller :document-id="documentId">
            <template #default="{ page }">
              <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
                <RenderLayer
                  :document-id="documentId"
                  :page-index="page.pageIndex"
                  style="pointer-events: none"
                />
                <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
                <AnnotationLayer :document-id="documentId" :page-index="page.pageIndex" />
              </PagePointerProvider>
            </template>
          </Scroller>
        </Viewport>
      </div>

      <div
        class="flex h-full min-h-[240px] flex-col overflow-hidden border-t border-gray-200 bg-white lg:w-1/3 lg:min-w-[250px] lg:max-w-[400px] lg:border-l lg:border-t-0 dark:border-gray-800 dark:bg-gray-900"
      >
        <div
          class="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800"
        >
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Form State (JSON)</h3>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Fill the form on the left to see the state update here.
          </p>
        </div>

        <div class="flex-1 overflow-auto p-4">
          <pre
            v-if="Object.keys(formValues).length > 0"
            class="text-xs text-gray-800 dark:text-gray-300"
            >{{ JSON.stringify(formValues, null, 2) }}</pre
          >
          <div v-else class="flex h-full items-center justify-center text-sm text-gray-400">
            Loading form data...
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
