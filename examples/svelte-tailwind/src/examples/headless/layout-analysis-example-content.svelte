<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import {
    LayoutAnalysisLayer,
    useLayoutAnalysis,
    type LayoutTask,
    type DocumentLayout,
    type DocumentAnalysisProgress,
  } from '@embedpdf/plugin-layout-analysis/svelte';
  import { useCapability } from '@embedpdf/core/svelte';
  import { AiManagerPlugin } from '@embedpdf/plugin-ai-manager/svelte';
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
  } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const la = useLayoutAnalysis(() => documentId);
  const aiManagerCapability = useCapability<AiManagerPlugin>('ai-manager');

  type AnalysisStatus =
    | { type: 'idle' }
    | { type: 'analyzing'; stage: string }
    | { type: 'done'; blockCount: number; backend: string }
    | { type: 'error'; message: string };

  let status = $state<AnalysisStatus>({ type: 'idle' });
  let activeTask: LayoutTask<DocumentLayout, DocumentAnalysisProgress> | null = null;

  function handleAnalyze() {
    if (!la.scope) return;

    status = { type: 'analyzing', stage: 'Starting...' };
    const task = la.scope.analyzeAllPages({ force: false });
    activeTask = task;

    task.onProgress((p) => {
      if (p.stage === 'downloading-model') {
        const pct = ((p.loaded / p.total) * 100).toFixed(0);
        status = { type: 'analyzing', stage: `Downloading model: ${pct}%` };
      } else if (p.stage === 'creating-session') {
        status = { type: 'analyzing', stage: 'Initializing model...' };
      } else if (p.stage === 'rendering') {
        status = { type: 'analyzing', stage: `Rendering page ${p.pageIndex + 1}...` };
      } else if (p.stage === 'layout-detection') {
        status = { type: 'analyzing', stage: `Detecting layout on page ${p.pageIndex + 1}...` };
      } else if (p.stage === 'table-structure') {
        status = {
          type: 'analyzing',
          stage: `Page ${p.pageIndex + 1}: table ${p.tableIndex + 1}/${p.tableCount}...`,
        };
      } else if (p.stage === 'mapping-coordinates') {
        status = {
          type: 'analyzing',
          stage: `Mapping coordinates (page ${p.pageIndex + 1})...`,
        };
      } else if (p.stage === 'page-complete') {
        status = { type: 'analyzing', stage: `Page ${p.completed}/${p.total} complete` };
      }
    });

    task.wait(
      (result) => {
        activeTask = null;
        const backend = aiManagerCapability.provides?.getBackend() ?? 'unknown';
        const totalBlocks = result.pages.reduce((sum, p) => sum + p.blocks.length, 0);
        status = { type: 'done', blockCount: totalBlocks, backend: String(backend) };
      },
      (error) => {
        activeTask = null;
        status = {
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

  const isAnalyzing = $derived(status.type === 'analyzing');
</script>

<div
  class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
>
  <!-- Toolbar -->
  <div
    class="space-y-2 border-b border-gray-300 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex items-center gap-2">
      <button
        onclick={handleAnalyze}
        disabled={isAnalyzing}
        class="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        {#if isAnalyzing}
          <Loader2 size={14} class="animate-spin" />
        {:else}
          <ScanSearch size={14} />
        {/if}
        {isAnalyzing ? 'Analyzing...' : 'Analyze All Pages'}
      </button>

      {#if isAnalyzing}
        <button
          onclick={handleCancel}
          class="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
        >
          <X size={12} />
          Cancel
        </button>
      {/if}

      <div class="ml-auto flex items-center gap-2">
        <button
          onclick={() => la.provides?.setTableStructureEnabled(!la.tableStructureEnabled)}
          class={[
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition',
            la.tableStructureEnabled
              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
          ].join(' ')}
          title="Enable/disable table structure analysis"
        >
          {#if la.tableStructureEnabled}
            <ToggleRight size={12} />
          {:else}
            <ToggleLeft size={12} />
          {/if}
          Table Analysis
        </button>

        <span class="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600"></span>

        <button
          onclick={() => la.provides?.setLayoutOverlayVisible(!la.layoutOverlayVisible)}
          class={[
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition',
            la.layoutOverlayVisible
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
          ].join(' ')}
          title="Toggle layout overlay"
        >
          <LayoutDashboard size={12} />
          Layout
          {#if la.layoutOverlayVisible}
            <Eye size={10} />
          {:else}
            <EyeOff size={10} />
          {/if}
        </button>

        <button
          onclick={() =>
            la.provides?.setTableStructureOverlayVisible(!la.tableStructureOverlayVisible)}
          class={[
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition',
            la.tableStructureOverlayVisible
              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
          ].join(' ')}
          title="Toggle table structure overlay"
        >
          <Table2 size={12} />
          Tables
          {#if la.tableStructureOverlayVisible}
            <Eye size={10} />
          {:else}
            <EyeOff size={10} />
          {/if}
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
          value={la.layoutThreshold}
          oninput={(e) =>
            la.provides?.setLayoutThreshold(parseFloat((e.target as HTMLInputElement).value))}
          class="h-1 w-20 accent-blue-600"
        />
        <span class="w-7 tabular-nums">{la.layoutThreshold.toFixed(2)}</span>
      </label>
      <label class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
        Table
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={la.tableStructureThreshold}
          oninput={(e) =>
            la.provides?.setTableStructureThreshold(
              parseFloat((e.target as HTMLInputElement).value),
            )}
          class="h-1 w-20 accent-orange-600"
        />
        <span class="w-7 tabular-nums">{la.tableStructureThreshold.toFixed(2)}</span>
      </label>

      <span class="ml-auto text-gray-500 dark:text-gray-400">
        {#if status.type === 'idle'}
          Click to detect layout elements on all pages
        {:else if status.type === 'analyzing'}
          {status.stage}
        {:else if status.type === 'done'}
          {status.blockCount} elements detected ({status.backend})
        {:else if status.type === 'error'}
          {status.message}
        {/if}
      </span>
    </div>
  </div>

  <!-- PDF Viewer -->
  <div class="relative h-[400px] sm:h-[800px]">
    {#snippet renderPage(page: RenderPageProps)}
      <RenderLayer {documentId} pageIndex={page.pageIndex} />
      <LayoutAnalysisLayer {documentId} pageIndex={page.pageIndex} />
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
