<script setup lang="ts">
import { ref } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { RedactionLayer, useRedaction } from '@embedpdf/plugin-redaction/vue';
import { RedactionMode } from '@embedpdf/plugin-redaction';
import { Type, Square, AlertCircle, Loader2, Check, Trash2 } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const { state, provides } = useRedaction(() => props.documentId);
const isCommitting = ref(false);

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
        Redact
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          @click="provides?.toggleRedactSelection()"
          :class="[
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
            state.activeType === RedactionMode.RedactSelection
              ? 'bg-blue-500 text-white ring-1 ring-blue-600'
              : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
          ]"
        >
          <Type :size="14" />
          <span class="hidden sm:inline">Mark Text</span>
        </button>
        <button
          @click="provides?.toggleMarqueeRedact()"
          :class="[
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
            state.activeType === RedactionMode.MarqueeRedact
              ? 'bg-blue-500 text-white ring-1 ring-blue-600'
              : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
          ]"
        >
          <Square :size="14" />
          <span class="hidden sm:inline">Mark Area</span>
        </button>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
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
      <span
        v-if="
          state.activeType === RedactionMode.RedactSelection ||
          state.activeType === RedactionMode.MarqueeRedact
        "
        class="hidden animate-pulse text-xs text-blue-600 lg:inline dark:text-blue-400"
      >
        {{
          state.activeType === RedactionMode.RedactSelection
            ? 'Select text to mark for redaction'
            : 'Draw a rectangle to mark for redaction'
        }}
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
              <RedactionLayer :document-id="documentId" :page-index="page.pageIndex">
                <template #selection-menu="props">
                  <div v-if="props.selected" v-bind="props.menuWrapperProps">
                    <div
                      class="flex cursor-default gap-2 rounded-lg border border-gray-300 bg-white p-1.5 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                      :style="{
                        position: 'absolute',
                        top: props.rect.size.height + 10 + 'px',
                        left: 0,
                        pointerEvents: 'auto',
                      }"
                    >
                      <button
                        @click="
                          provides?.commitPending(props.context.item.page, props.context.item.id)
                        "
                        class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-red-600 transition-colors hover:bg-red-600"
                      >
                        <Check :size="12" />
                        Apply
                      </button>
                      <button
                        @click="
                          provides?.removePending(props.context.item.page, props.context.item.id)
                        "
                        class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600"
                      >
                        <Trash2 :size="12" />
                        Remove
                      </button>
                    </div>
                  </div>
                </template>
              </RedactionLayer>
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
