<script setup lang="ts">
import { computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { TilingLayer } from '@embedpdf/plugin-tiling/vue';
import { AnnotationLayer, useAnnotation } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { Rotate, useRotate } from '@embedpdf/plugin-rotate/vue';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import type { PdfAnnotationFlagName } from '@embedpdf/models';
import { MousePointerClick, RotateCcw, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-vue-next';
import { DEMO_ANNOTATIONS, DEMO_PAGE_INDEX } from './annotation-flags-example-seeds';

const props = defineProps<{
  documentId: string;
}>();

const TOGGLEABLE_FLAGS: Array<{
  flag: PdfAnnotationFlagName;
  description: string;
}> = [
  { flag: 'hidden', description: 'not rendered, not selectable' },
  { flag: 'noView', description: 'not rendered, not selectable, still printable' },
  { flag: 'readOnly', description: 'rendered but no interaction' },
  { flag: 'locked', description: 'selectable but cannot be moved / resized / rotated' },
  { flag: 'lockedContents', description: 'selectable and movable but text cannot be edited' },
];

const { provides: annotationApi, state: annotationState } = useAnnotation(() => props.documentId);
const { provides: zoom, state: zoomState } = useZoom(() => props.documentId);
const { rotation, provides: rotate } = useRotate(() => props.documentId);

const zoomPercentage = computed(() => Math.round(zoomState.value.currentZoomLevel * 100));
const rotationDegrees = computed(() => rotation.value * 90);

const selectedId = computed(() => annotationState.value.selectedUids[0] ?? null);
const tracked = computed(() => {
  const id = selectedId.value;
  return id ? (annotationState.value.byUid[id] ?? null) : null;
});
const selectedLabel = computed(() => {
  const id = selectedId.value;
  return id ? (DEMO_ANNOTATIONS.find((a) => a.id === id)?.label ?? null) : null;
});
const currentFlags = computed<PdfAnnotationFlagName[]>(() => tracked.value?.object.flags ?? []);
const flagEditorDisabled = computed(() => !tracked.value || !annotationApi.value);

const toggleFlag = (flag: PdfAnnotationFlagName) => {
  const api = annotationApi.value;
  const t = tracked.value;
  if (!api || !t) return;
  const flags = currentFlags.value;
  const next = flags.includes(flag) ? flags.filter((f) => f !== flag) : [...flags, flag];
  api.updateAnnotation(DEMO_PAGE_INDEX, t.object.id, { flags: next });
};

const clearFlags = () => {
  const api = annotationApi.value;
  const t = tracked.value;
  if (!api || !t || currentFlags.value.length === 0) return;
  api.updateAnnotation(DEMO_PAGE_INDEX, t.object.id, { flags: [] });
};

const restoreDemo = () => {
  const api = annotationApi.value;
  if (!api) return;
  for (const { id, seed } of DEMO_ANNOTATIONS) {
    const existing = api.getAnnotationById(id);
    if (existing) {
      api.updateAnnotation(DEMO_PAGE_INDEX, id, { flags: [] });
    } else {
      api.createAnnotation(DEMO_PAGE_INDEX, seed);
    }
  }
};

const handleDeleteFromMenu = (pageIndex: number, id: string, locked: boolean) => {
  if (locked) return;
  annotationApi.value?.deleteAnnotation(pageIndex, id);
};

const statusLabelFor = (structurallyLocked: boolean, contentLocked: boolean) => {
  if (structurallyLocked) {
    return contentLocked ? 'structurally + content locked' : 'structurally locked';
  }
  return contentLocked ? 'content locked' : 'interactive';
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <!-- Toolbar -->
    <div
      class="flex flex-col gap-3 border-b border-gray-300 bg-gray-100 px-3 py-3 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <!-- Zoom controls -->
        <div v-if="zoom" class="flex items-center gap-1.5">
          <button
            @click="zoom.zoomOut()"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom out"
          >
            <ZoomOut :size="14" />
          </button>
          <div
            class="min-w-[52px] rounded-md bg-white px-2 py-0.5 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
          >
            <span class="font-mono text-xs font-medium text-gray-700 dark:text-gray-200">
              {{ zoomPercentage }}%
            </span>
          </div>
          <button
            @click="zoom.zoomIn()"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Zoom in"
          >
            <ZoomIn :size="14" />
          </button>
          <button
            @click="zoom.requestZoom(ZoomMode.FitPage)"
            class="ml-1 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Fit page"
          >
            <span>Fit</span>
          </button>
        </div>

        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

        <!-- Rotate controls -->
        <div v-if="rotate" class="flex items-center gap-1.5">
          <button
            @click="rotate.rotateBackward"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Rotate counter-clockwise"
          >
            <RotateCcw :size="14" />
          </button>
          <div
            class="min-w-[52px] rounded-md bg-white px-2 py-0.5 text-center shadow-sm ring-1 ring-gray-300 dark:bg-gray-700 dark:ring-gray-600"
          >
            <span class="font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
              {{ rotationDegrees }}°
            </span>
          </div>
          <button
            @click="rotate.rotateForward"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100"
            title="Rotate clockwise"
          >
            <RotateCw :size="14" />
          </button>
        </div>

        <div class="ml-auto">
          <button
            @click="restoreDemo"
            class="inline-flex items-center gap-1.5 rounded-md bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500"
            title="Clear flags and restore all demo annotations"
          >
            <RotateCcw :size="14" />
            <span>Reset demo</span>
          </button>
        </div>
      </div>

      <!-- Flag editor: single panel driven by the current selection -->
      <div
        class="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <template v-if="tracked">
              <span
                class="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              <span class="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
                {{ selectedLabel ?? 'Selected annotation' }}
              </span>
              <code
                class="hidden shrink-0 rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 ring-1 ring-gray-200 sm:inline dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
              >
                flags: [{{ currentFlags.join(', ') }}]
              </code>
            </template>
            <template v-else>
              <MousePointerClick
                :size="14"
                class="shrink-0 text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                Click an annotation on the page to edit its flags
              </span>
            </template>
          </div>
          <button
            @click="clearFlags"
            :disabled="flagEditorDisabled || currentFlags.length === 0"
            class="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 shadow-sm ring-1 ring-gray-300 transition-all hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100 dark:disabled:hover:bg-gray-700 dark:disabled:hover:text-gray-300"
            title="Clear all flags on the selected annotation"
          >
            Clear flags
          </button>
        </div>

        <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
          <button
            v-for="{ flag, description } in TOGGLEABLE_FLAGS"
            :key="flag"
            @click="toggleFlag(flag)"
            :disabled="flagEditorDisabled"
            :title="description"
            :class="[
              'flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs font-medium shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40',
              currentFlags.includes(flag)
                ? 'bg-blue-500 text-white ring-1 ring-blue-600 hover:bg-blue-600'
                : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700',
            ]"
          >
            <span class="font-mono text-[11px]">{{ flag }}</span>
            <span
              :class="[
                'text-[10px] font-normal leading-tight',
                currentFlags.includes(flag) ? 'text-blue-50' : 'text-gray-500 dark:text-gray-400',
              ]"
            >
              {{ description }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[500px] sm:h-[600px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <Rotate :document-id="documentId" :page-index="page.pageIndex">
              <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
                <RenderLayer
                  :document-id="documentId"
                  :page-index="page.pageIndex"
                  :scale="1"
                  style="pointer-events: none"
                />
                <TilingLayer
                  :document-id="documentId"
                  :page-index="page.pageIndex"
                  style="pointer-events: none"
                />
                <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
                <AnnotationLayer :document-id="documentId" :page-index="page.pageIndex">
                  <template
                    #selection-menu="{ selected, context, menuWrapperProps, rect, placement }"
                  >
                    <div v-if="selected" v-bind="menuWrapperProps">
                      <div
                        class="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs shadow-md dark:border-gray-700 dark:bg-gray-800"
                        :style="{
                          position: 'absolute',
                          pointerEvents: 'auto',
                          cursor: 'default',
                          top: placement.suggestTop ? '-40px' : `${rect.size.height + 8}px`,
                        }"
                      >
                        <button
                          @click="
                            handleDeleteFromMenu(
                              context.annotation.object.pageIndex,
                              context.annotation.object.id,
                              context.structurallyLocked,
                            )
                          "
                          :disabled="context.structurallyLocked"
                          :title="
                            context.structurallyLocked
                              ? 'Locked — cannot delete'
                              : 'Delete annotation'
                          "
                          class="inline-flex h-6 w-6 items-center justify-center rounded text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-600 dark:text-gray-300 dark:hover:bg-red-500/20 dark:hover:text-red-400 dark:disabled:hover:text-gray-300"
                          aria-label="Delete annotation"
                        >
                          <Trash2 :size="13" />
                        </button>
                        <span
                          class="border-l border-gray-200 pl-2 font-mono text-[10px] tracking-tight text-gray-500 dark:border-gray-700 dark:text-gray-400"
                        >
                          {{ statusLabelFor(context.structurallyLocked, context.contentLocked) }}
                        </span>
                      </div>
                    </div>
                  </template>
                </AnnotationLayer>
              </PagePointerProvider>
            </Rotate>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
