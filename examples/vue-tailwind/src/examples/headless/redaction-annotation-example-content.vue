<script setup lang="ts">
import { ref, computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { AnnotationLayer, useAnnotation } from '@embedpdf/plugin-annotation/vue';
import { RedactionLayer, RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/vue';
import { PdfAnnotationSubtype, PdfRedactAnnoObject } from '@embedpdf/models';
import { AlertCircle, Loader2, Check, Crosshair, Trash2 } from 'lucide-vue-next';

// Color options for redaction annotations
const REDACTION_COLORS = [
  { name: 'Red', value: '#E44234' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Purple', value: '#9333EA' },
];

const props = defineProps<{
  documentId: string;
}>();

const { state, provides } = useRedaction(() => props.documentId);
const { state: annotationState, provides: annotationApi } = useAnnotation(() => props.documentId);
const isCommitting = ref(false);

// Get selected REDACT annotation from state
const selectedRedact = computed(() => {
  if (!annotationState.value.selectedUid) return null;
  const tracked = annotationState.value.byUid[annotationState.value.selectedUid];
  if (!tracked) return null;
  if (tracked.object.type !== PdfAnnotationSubtype.REDACT) return null;
  return tracked.object as PdfRedactAnnoObject;
});

const selectedAnnotationId = computed(() => selectedRedact.value?.id ?? null);
const selectedColor = computed(() => selectedRedact.value?.strokeColor ?? null);

const handleApplyAll = () => {
  if (!provides.value || isCommitting.value) return;
  isCommitting.value = true;
  provides.value.commitAllPending().wait(
    () => {
      isCommitting.value = false;
    },
    () => {
      isCommitting.value = false;
    },
  );
};

const handleColorChange = (color: string) => {
  if (!annotationApi.value || !selectedRedact.value) return;

  annotationApi.value.updateAnnotation(selectedRedact.value.pageIndex, selectedRedact.value.id, {
    strokeColor: color,
    color: color,
  });
};

const isRedactActive = computed(() => state.value.activeType === RedactionMode.Redact);
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <!-- Toolbar -->
    <div
      class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Annotation Mode
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

      <!-- Unified redact mode button -->
      <button
        @click="provides?.toggleRedact()"
        :class="[
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
          isRedactActive
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
        ]"
      >
        <Crosshair :size="14" />
        <span class="hidden sm:inline">Redact</span>
      </button>

      <!-- Color picker - visible when annotation is selected -->
      <template v-if="selectedAnnotationId">
        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-gray-500 dark:text-gray-400">Color:</span>
          <button
            v-for="c in REDACTION_COLORS"
            :key="c.value"
            @click="handleColorChange(c.value)"
            :class="[
              'h-5 w-5 rounded-full transition-all',
              selectedColor === c.value
                ? 'ring-2 ring-gray-800 ring-offset-1 dark:ring-gray-200'
                : 'hover:scale-110',
            ]"
            :style="{ backgroundColor: c.value }"
            :title="c.name"
          />
        </div>
      </template>

      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>

      <!-- Pending count and apply -->
      <div class="flex items-center gap-2">
        <span
          v-if="state.pendingCount > 0"
          class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
        >
          <AlertCircle :size="14" />
          {{ state.pendingCount }} pending
        </span>
        <span v-else class="text-xs text-gray-500 dark:text-gray-400">No marks pending</span>
        <button
          @click="handleApplyAll"
          :disabled="state.pendingCount === 0 || isCommitting"
          class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm ring-1 ring-red-600 transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Loader2 v-if="isCommitting" :size="14" class="animate-spin" />
          <Check v-else :size="14" />
          {{ isCommitting ? 'Applying...' : 'Apply All' }}
        </button>
      </div>

      <!-- Hint text -->
      <span
        v-if="isRedactActive"
        class="hidden animate-pulse text-xs text-blue-600 lg:inline dark:text-blue-400"
      >
        Select text or draw a rectangle to mark for redaction
      </span>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[450px] sm:h-[550px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                :scale="1"
                style="pointer-events: none"
              />
              <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
              <!-- AnnotationLayer renders REDACT annotations -->
              <AnnotationLayer :document-id="documentId" :page-index="page.pageIndex">
                <template #selection-menu="menuProps">
                  <div v-if="menuProps.selected" v-bind="menuProps.menuWrapperProps">
                    <div
                      class="flex gap-1 rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                      :style="{
                        position: 'absolute',
                        top: menuProps.rect.size.height + 8 + 'px',
                        left: 0,
                        pointerEvents: 'auto',
                      }"
                    >
                      <button
                        @click="
                          annotationApi?.deleteAnnotation(
                            menuProps.context.pageIndex,
                            menuProps.context.annotation.object.id,
                          )
                        "
                        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600"
                      >
                        <Trash2 :size="12" />
                        Delete
                      </button>
                    </div>
                  </div>
                </template>
              </AnnotationLayer>
              <!-- RedactionLayer renders marquee/selection UI -->
              <RedactionLayer :document-id="documentId" :page-index="page.pageIndex" />
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
