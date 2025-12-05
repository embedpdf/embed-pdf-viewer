<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { RedactionLayer, RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/svelte';
  import { Type, Square, AlertCircle, Loader2, Check, Trash2 } from 'lucide-svelte';

  interface Props {
    documentId: string;
  }

  let { documentId }: Props = $props();

  const redaction = useRedaction(() => documentId);
  let isCommitting = $state(false);

  const handleApplyAll = () => {
    if (!redaction.provides || isCommitting) return;
    isCommitting = true;
    redaction.provides.commitAllPending().wait(
      () => {
        isCommitting = false;
      },
      () => {
        isCommitting = false;
      },
    );
  };
</script>

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
        type="button"
        onclick={() => redaction.provides?.toggleRedactSelection()}
        class={[
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
          redaction.state.activeType === RedactionMode.RedactSelection
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
        ].join(' ')}
      >
        <Type size={14} />
        <span class="hidden sm:inline">Mark Text</span>
      </button>
      <button
        type="button"
        onclick={() => redaction.provides?.toggleMarqueeRedact()}
        class={[
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
          redaction.state.activeType === RedactionMode.MarqueeRedact
            ? 'bg-blue-500 text-white ring-1 ring-blue-600'
            : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
        ].join(' ')}
      >
        <Square size={14} />
        <span class="hidden sm:inline">Mark Area</span>
      </button>
    </div>
    <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
    <div class="flex items-center gap-2">
      {#if redaction.state.pendingCount > 0}
        <span
          class="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
        >
          <AlertCircle size={14} />
          {redaction.state.pendingCount} pending
        </span>
      {:else}
        <span class="text-xs text-gray-500 dark:text-gray-400">No marks pending</span>
      {/if}
      <button
        type="button"
        onclick={handleApplyAll}
        disabled={redaction.state.pendingCount === 0 || isCommitting}
        class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm ring-1 ring-red-600 transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if isCommitting}
          <Loader2 size={14} class="animate-spin" />
        {:else}
          <Check size={14} />
        {/if}
        {isCommitting ? 'Applying...' : 'Apply All'}
      </button>
    </div>
    {#if redaction.state.activeType === RedactionMode.RedactSelection || redaction.state.activeType === RedactionMode.MarqueeRedact}
      <span class="hidden animate-pulse text-xs text-blue-600 lg:inline dark:text-blue-400">
        {redaction.state.activeType === RedactionMode.RedactSelection
          ? 'Select text to mark for redaction'
          : 'Draw a rectangle to mark for redaction'}
      </span>
    {/if}
  </div>

  <!-- PDF Viewer Area -->
  <div class="relative h-[450px] sm:h-[550px]">
    {#snippet renderPage(page: RenderPageProps)}
      <PagePointerProvider {documentId} pageIndex={page.pageIndex}>
        <RenderLayer
          {documentId}
          pageIndex={page.pageIndex}
          scale={1}
          class="pointer-events-none"
        />
        <SelectionLayer {documentId} pageIndex={page.pageIndex} />
        <RedactionLayer {documentId} pageIndex={page.pageIndex}>
          {#snippet selectionMenuSnippet(props)}
            {#if props.selected}
              <span style={props.menuWrapperProps.style} use:props.menuWrapperProps.action>
                <div
                  class="flex cursor-default gap-2 rounded-lg border border-gray-300 bg-white p-1.5 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                  style:position="absolute"
                  style:top="{props.rect.size.height + 10}px"
                  style:left="0"
                  style:pointer-events="auto"
                >
                  <button
                    type="button"
                    onclick={() =>
                      redaction.provides?.commitPending(
                        props.context.item.page,
                        props.context.item.id,
                      )}
                    class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-red-600 transition-colors hover:bg-red-600"
                  >
                    <Check size={12} />
                    Apply
                  </button>
                  <button
                    type="button"
                    onclick={() =>
                      redaction.provides?.removePending(
                        props.context.item.page,
                        props.context.item.id,
                      )}
                    class="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-600"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              </span>
            {/if}
          {/snippet}
        </RedactionLayer>
      </PagePointerProvider>
    {/snippet}
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
</div>
