<script setup lang="ts">
import { ref, computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { LayoutAnalysisLayer, useLayoutAnalysis } from '@embedpdf/plugin-layout-analysis/vue';
import type {
  LayoutTask,
  DocumentLayout,
  DocumentAnalysisProgress,
} from '@embedpdf/plugin-layout-analysis';
import { useCapability } from '@embedpdf/core/vue';
import { AiManagerPlugin } from '@embedpdf/plugin-ai-manager/vue';
import {
  Loader2,
  ScanSearch,
  X,
  Eye,
  EyeOff,
  Table2,
  LayoutDashboard,
  ToggleLeft,
  ToggleRight,
} from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const la = useLayoutAnalysis(() => props.documentId);
const { provides: aiManager } = useCapability<AiManagerPlugin>('ai-manager');

type AnalysisStatus =
  | { type: 'idle' }
  | { type: 'analyzing'; stage: string }
  | { type: 'done'; blockCount: number; backend: string }
  | { type: 'error'; message: string };

const status = ref<AnalysisStatus>({ type: 'idle' });
let activeTask: LayoutTask<DocumentLayout, DocumentAnalysisProgress> | null = null;

const isAnalyzing = computed(() => status.value.type === 'analyzing');

function handleAnalyze() {
  if (!la.scope.value) return;

  status.value = { type: 'analyzing', stage: 'Starting...' };
  const task = la.scope.value.analyzeAllPages({ force: false });
  activeTask = task;

  task.onProgress((p) => {
    if (p.stage === 'downloading-model') {
      const pct = ((p.loaded / p.total) * 100).toFixed(0);
      status.value = { type: 'analyzing', stage: `Downloading model: ${pct}%` };
    } else if (p.stage === 'creating-session') {
      status.value = { type: 'analyzing', stage: 'Initializing model...' };
    } else if (p.stage === 'rendering') {
      status.value = { type: 'analyzing', stage: `Rendering page ${p.pageIndex + 1}...` };
    } else if (p.stage === 'layout-detection') {
      status.value = {
        type: 'analyzing',
        stage: `Detecting layout on page ${p.pageIndex + 1}...`,
      };
    } else if (p.stage === 'table-structure') {
      status.value = {
        type: 'analyzing',
        stage: `Page ${p.pageIndex + 1}: table ${p.tableIndex + 1}/${p.tableCount}...`,
      };
    } else if (p.stage === 'mapping-coordinates') {
      status.value = {
        type: 'analyzing',
        stage: `Mapping coordinates (page ${p.pageIndex + 1})...`,
      };
    } else if (p.stage === 'page-complete') {
      status.value = { type: 'analyzing', stage: `Page ${p.completed}/${p.total} complete` };
    }
  });

  task.wait(
    (result) => {
      activeTask = null;
      const backend = aiManager.value?.getBackend() ?? 'unknown';
      const totalBlocks = result.pages.reduce((sum, p) => sum + p.blocks.length, 0);
      status.value = { type: 'done', blockCount: totalBlocks, backend: String(backend) };
    },
    (error) => {
      activeTask = null;
      status.value = {
        type: 'error',
        message: error.type === 'abort' ? 'Cancelled' : error.reason.message,
      };
    },
  );
}

function handleCancel() {
  if (activeTask) {
    activeTask.abort({ type: 'no-document', message: 'Cancelled by user' });
    activeTask = null;
  }
}
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Toolbar -->
    <div
      class="space-y-2 border-b border-gray-300 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900"
    >
      <div class="flex items-center gap-2">
        <button
          @click="handleAnalyze"
          :disabled="isAnalyzing"
          class="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          <Loader2 v-if="isAnalyzing" :size="14" class="animate-spin" />
          <ScanSearch v-else :size="14" />
          {{ isAnalyzing ? 'Analyzing...' : 'Analyze All Pages' }}
        </button>

        <button
          v-if="isAnalyzing"
          @click="handleCancel"
          class="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
        >
          <X :size="12" />
          Cancel
        </button>

        <div class="ml-auto flex items-center gap-2">
          <button
            @click="la.provides.value?.setTableStructureEnabled(!la.tableStructureEnabled.value)"
            :class="[
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition',
              la.tableStructureEnabled.value
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
            ]"
            title="Enable/disable table structure analysis"
          >
            <ToggleRight v-if="la.tableStructureEnabled.value" :size="12" />
            <ToggleLeft v-else :size="12" />
            Table Analysis
          </button>

          <span class="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" />

          <button
            @click="la.provides.value?.setLayoutOverlayVisible(!la.layoutOverlayVisible.value)"
            :class="[
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition',
              la.layoutOverlayVisible.value
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
            ]"
            title="Toggle layout overlay"
          >
            <LayoutDashboard :size="12" />
            Layout
            <Eye v-if="la.layoutOverlayVisible.value" :size="10" />
            <EyeOff v-else :size="10" />
          </button>

          <button
            @click="
              la.provides.value?.setTableStructureOverlayVisible(
                !la.tableStructureOverlayVisible.value,
              )
            "
            :class="[
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition',
              la.tableStructureOverlayVisible.value
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
            ]"
            title="Toggle table structure overlay"
          >
            <Table2 :size="12" />
            Tables
            <Eye v-if="la.tableStructureOverlayVisible.value" :size="10" />
            <EyeOff v-else :size="10" />
          </button>
        </div>
      </div>

      <div class="flex items-center gap-4 text-xs">
        <label class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          Layout
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="la.layoutThreshold.value"
            @input="
              la.provides.value?.setLayoutThreshold(
                parseFloat(($event.target as HTMLInputElement).value),
              )
            "
            class="h-1 w-20 accent-blue-600"
          />
          <span class="w-7 tabular-nums">{{ la.layoutThreshold.value.toFixed(2) }}</span>
        </label>
        <label class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          Table
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="la.tableStructureThreshold.value"
            @input="
              la.provides.value?.setTableStructureThreshold(
                parseFloat(($event.target as HTMLInputElement).value),
              )
            "
            class="h-1 w-20 accent-orange-600"
          />
          <span class="w-7 tabular-nums">{{ la.tableStructureThreshold.value.toFixed(2) }}</span>
        </label>

        <span class="ml-auto text-gray-500 dark:text-gray-400">
          <template v-if="status.type === 'idle'">
            Click to detect layout elements on all pages
          </template>
          <template v-else-if="status.type === 'analyzing'">
            {{ status.stage }}
          </template>
          <template v-else-if="status.type === 'done'">
            {{ status.blockCount }} elements detected ({{ status.backend }})
          </template>
          <template v-else-if="status.type === 'error'">
            {{ status.message }}
          </template>
        </span>
      </div>
    </div>

    <!-- PDF Viewer -->
    <div class="relative h-[400px] sm:h-[800px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <RenderLayer :document-id="documentId" :page-index="page.pageIndex" />
            <LayoutAnalysisLayer :document-id="documentId" :page-index="page.pageIndex" />
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
