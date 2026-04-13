<script setup lang="ts">
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { useExport } from '@embedpdf/plugin-export/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { useZoom } from '@embedpdf/plugin-zoom/vue';
import { useFormCapability } from '@embedpdf/plugin-form/vue';
import { Download, Trash2, Wand2, ZoomIn, ZoomOut } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { provides: zoom } = useZoom(() => props.documentId);
const { provides: exportApi } = useExport(() => props.documentId);
const { provides: formCapability } = useFormCapability();

const handleFillDemoData = () => {
  const scope = formCapability.value?.forDocument(props.documentId);
  scope?.setFormValues({
    First_Name: 'Jane',
    Last_Name: 'Doe',
    Email_Address: 'jane.doe@example.com',
    Phone_Number: '+1 (555) 123-4567',
    Home_Address: '123 Main Street',
    City: 'San Francisco',
    State: 'CA',
    Postal_Code: '94102',
    Department: 'Design',
    Employment_Type: 'Contract',
    Office_Location: 'San Francisco',
    Start_Date: '2026-04-01',
    Programming_Languages: 'TypeScript, Rust, Go',
    Framework_Tools: 'React, Node.js, Docker',
    Comments: 'I would like to have a standing desk and a dual monitor setup.',
    Equipment_Laptop: 'Yes',
    Equipment_Monitor: 'Yes',
    Equipment_Keyboard: 'Yes',
    Equipment_Desk: 'Yes',
    Access_Repository: 'Yes',
    Access_Cloud: 'Yes',
    Access_Internal: 'Yes',
    Access_VPN: 'Yes',
    Terms: 'Yes',
    Preferred_Shift: '4f803c06-508d-4232-bd84-82452b6561f1',
    Work_Arrangement: 'd43ec6d3-9e8c-403f-98d7-e2c818070ac4',
  });
};

const handleClearForm = () => {
  const scope = formCapability.value?.forDocument(props.documentId);
  scope?.setFormValues({
    First_Name: '',
    Last_Name: '',
    Email_Address: '',
    Phone_Number: '',
    Home_Address: '',
    City: '',
    State: '',
    Postal_Code: '',
    Department: 'Engineering',
    Employment_Type: 'Full-time',
    Office_Location: 'New York',
    Start_Date: '',
    Programming_Languages: '',
    Framework_Tools: '',
    Comments: '',
    Equipment_Laptop: 'Off',
    Equipment_Monitor: 'Off',
    Equipment_Keyboard: 'Off',
    Equipment_Desk: 'Off',
    Access_Repository: 'Off',
    Access_Cloud: 'Off',
    Access_Internal: 'Off',
    Access_VPN: 'Off',
    Terms: 'Off',
    Preferred_Shift: '1a5963ac-8d1e-4c83-9a8b-da53700e46c1',
    Work_Arrangement: 'e424be12-71f7-4458-b1a3-a71a0b100729',
  });
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          @click="handleFillDemoData"
          class="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Wand2 :size="16" />
          Auto Fill Data
        </button>

        <button
          type="button"
          @click="handleClearForm"
          class="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Trash2 :size="16" />
          Clear Form
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            @click="zoom?.zoomOut()"
            :disabled="!zoom"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom Out"
          >
            <ZoomOut :size="16" />
          </button>

          <button
            type="button"
            @click="zoom?.zoomIn()"
            :disabled="!zoom"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
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
    </div>

    <div class="relative h-[420px] sm:h-[550px]">
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
  </div>
</template>
