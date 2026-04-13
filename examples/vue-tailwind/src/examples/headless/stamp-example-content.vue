<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AnnotationLayer, useAnnotation } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import {
  StampImg,
  useActiveStamp,
  useStampCapability,
  useStampLibraries,
  useStampsByLibrary,
  type StampDefinition,
} from '@embedpdf/plugin-stamp/vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { useZoom } from '@embedpdf/plugin-zoom/vue';
import { ignore, PdfAnnotationName, PdfAnnotationSubtype } from '@embedpdf/models';
import {
  Download,
  Info,
  LibraryBig,
  MousePointer2,
  Square,
  Stamp,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next';

const CUSTOM_LIBRARY_ID = 'custom';
const SIDEBAR_CATEGORY = 'sidebar';
const STAMP_THUMB_WIDTH = 120;

const unsupportedStampSourceTypes: PdfAnnotationSubtype[] = [
  PdfAnnotationSubtype.REDACT,
  PdfAnnotationSubtype.HIGHLIGHT,
  PdfAnnotationSubtype.SQUIGGLY,
  PdfAnnotationSubtype.UNDERLINE,
  PdfAnnotationSubtype.STRIKEOUT,
  PdfAnnotationSubtype.CARET,
  PdfAnnotationSubtype.WIDGET,
];

const props = defineProps<{
  documentId: string;
}>();

const selectedLibraryId = ref('all');
const message = ref('Draw a square, select it, and save it as a reusable stamp.');

const { provides: annotationApi, state } = useAnnotation(() => props.documentId);
const { provides: stampCapability } = useStampCapability();
const { provides: zoom } = useZoom(() => props.documentId);
const { libraries } = useStampLibraries();
const stamps = useStampsByLibrary(
  () => selectedLibraryId.value,
  () => SIDEBAR_CATEGORY,
);
const activeStamp = useActiveStamp(() => props.documentId);

watch(
  libraries,
  (nextLibraries) => {
    if (
      selectedLibraryId.value !== 'all' &&
      !nextLibraries.some((library) => library.id === selectedLibraryId.value)
    ) {
      selectedLibraryId.value = 'all';
    }
  },
  { immediate: true },
);

const selectedAnnotation = computed(() => {
  state.value.selectedUid;
  return annotationApi.value?.getSelectedAnnotation() ?? null;
});

const canCreateStamp = computed(() => {
  const type = selectedAnnotation.value?.object.type;
  return !!type && !unsupportedStampSourceTypes.includes(type);
});

const customLibrary = computed(() =>
  libraries.value.find((library) => library.id === CUSTOM_LIBRARY_ID),
);

const customStampCount = computed(() => customLibrary.value?.stamps.length ?? 0);

const statusMessage = computed(() => {
  if (state.value.activeToolId === 'rubberStamp' && activeStamp.value) {
    return `Placing: ${activeStamp.value.stamp.subject}`;
  }

  return `${customStampCount.value} custom stamp${customStampCount.value === 1 ? '' : 's'} saved`;
});

const downloadPdf = (filename: string, bytes: ArrayBuffer) => {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
};

const handleStampClick = (libraryId: string, stamp: StampDefinition) => {
  stampCapability.value
    ?.forDocument(props.documentId)
    .activateStampPlacement(libraryId, stamp)
    .wait(() => {}, ignore);
};

const handleCreateStamp = () => {
  if (!stampCapability.value || !selectedAnnotation.value || !canCreateStamp.value) return;

  message.value = 'Creating a stamp from the selected annotation...';

  stampCapability.value
    .forDocument(props.documentId)
    .createStampFromAnnotation(
      selectedAnnotation.value.object,
      {
        name: PdfAnnotationName.Custom,
        subject: `Custom Stamp ${customStampCount.value + 1}`,
        categories: ['custom', SIDEBAR_CATEGORY],
      },
      CUSTOM_LIBRARY_ID,
    )
    .wait(
      () => {
        selectedLibraryId.value = CUSTOM_LIBRARY_ID;
        message.value = 'Saved the selected annotation into the Custom Stamps library.';
      },
      () => {
        message.value = 'Could not create a stamp from the selected annotation.';
      },
    );
};

const handleExportCustomLibrary = () => {
  if (!stampCapability.value) return;

  message.value = 'Exporting the custom library PDF...';

  stampCapability.value.exportLibrary(CUSTOM_LIBRARY_ID).wait(
    (exported) => {
      downloadPdf(`${exported.name}.pdf`, exported.pdf);
      message.value = 'Downloaded the custom library as a PDF.';
    },
    () => {
      message.value = 'Could not export the custom stamp library.';
    },
  );
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <div class="flex flex-col border-b border-gray-300 dark:border-gray-700">
      <div
        class="flex flex-wrap items-center justify-between gap-3 bg-gray-100 px-3 py-2 dark:bg-gray-800"
      >
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            @click="annotationApi?.setActiveTool(null)"
            :class="[
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              !state.activeToolId
                ? 'bg-slate-700 text-white dark:bg-slate-600 dark:text-white'
                : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600',
            ]"
          >
            <MousePointer2 :size="16" />
            Select
          </button>

          <button
            type="button"
            @click="annotationApi?.setActiveTool(state.activeToolId === 'square' ? null : 'square')"
            :class="[
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              state.activeToolId === 'square'
                ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600',
            ]"
          >
            <Square :size="16" />
            Square
          </button>

          <div class="mx-1 hidden h-5 w-px bg-gray-300 sm:block dark:bg-gray-600"></div>

          <button
            type="button"
            @click="handleCreateStamp"
            :disabled="!canCreateStamp"
            class="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Stamp :size="16" />
            Create from Selection
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

          <div class="mx-1 hidden h-5 w-px bg-gray-300 sm:block dark:bg-gray-600"></div>

          <button
            type="button"
            @click="handleExportCustomLibrary"
            :disabled="customStampCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Download :size="16" />
            Export Custom Library
          </button>
        </div>
      </div>

      <div
        class="flex items-center justify-between bg-gray-50 px-4 py-1.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
      >
        <div class="flex items-center gap-1.5">
          <Info :size="14" class="text-gray-400" />
          <span>{{ message }}</span>
        </div>
        <span class="hidden sm:inline-block">{{ statusMessage }}</span>
      </div>
    </div>

    <div class="flex flex-col lg:h-[600px] lg:flex-row">
      <div class="border-b border-gray-200 lg:border-b-0 lg:border-r dark:border-gray-800">
        <aside class="flex h-full w-full shrink-0 flex-col bg-white lg:w-[280px] dark:bg-gray-900">
          <div class="shrink-0 border-b border-gray-200 p-4 dark:border-gray-800">
            <div class="flex items-center gap-2">
              <LibraryBig class="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Stamp Library</h2>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Pick a stamp, then click the document to place it.
            </p>

            <select
              v-if="libraries.length > 1"
              v-model="selectedLibraryId"
              class="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-blue-400"
            >
              <option value="all">All Stamps</option>
              <option v-for="library in libraries" :key="library.id" :value="library.id">
                {{ library.name }}
              </option>
            </select>
          </div>

          <div class="max-h-[240px] flex-1 overflow-y-auto p-4 lg:max-h-none">
            <div
              v-if="stamps.length > 0"
              class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2"
            >
              <button
                v-for="{ library, stamp } in stamps"
                :key="`${library.id}-${stamp.id}`"
                type="button"
                @click="handleStampClick(library.id, stamp)"
                :class="[
                  'group flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all',
                  activeStamp?.libraryId === library.id && activeStamp?.stamp.id === stamp.id
                    ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500 dark:border-blue-400 dark:bg-blue-900/20 dark:ring-blue-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-700',
                ]"
              >
                <div
                  class="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-900"
                >
                  <StampImg
                    :libraryId="library.id"
                    :pageIndex="stamp.pageIndex"
                    :width="STAMP_THUMB_WIDTH"
                    :alt="stamp.label ?? stamp.subject"
                    :style="{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }"
                  />
                </div>
                <div class="w-full">
                  <div class="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                    {{ stamp.label ?? stamp.subject }}
                  </div>
                  <div class="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">
                    {{ library.name }}
                  </div>
                </div>
              </button>
            </div>

            <div
              v-else
              class="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
            >
              <Stamp class="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p>No stamps available.</p>
            </div>
          </div>
        </aside>
      </div>

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
    </div>
  </div>
</template>
