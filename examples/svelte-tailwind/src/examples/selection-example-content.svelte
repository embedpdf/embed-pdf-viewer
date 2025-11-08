<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import {
    SelectionLayer,
    useSelectionCapability,
    type SelectionRangeX,
  } from '@embedpdf/plugin-selection/svelte';
  import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/svelte';
  import { ignore } from '@embedpdf/models';

  const selection = useSelectionCapability();
  let hasSelection = $state(false);
  let selectedText = $state('');

  $effect(() => {
    if (!selection.provides) return;

    const unsubscribe1 = selection.provides.onSelectionChange(
      (selectionRange: SelectionRangeX | null) => {
        hasSelection = !!selectionRange;
        if (!selectionRange) {
          selectedText = '';
        }
      },
    );

    const unsubscribe2 = selection.provides.onEndSelection(() => {
      const textTask = selection.provides!.getSelectedText();
      textTask.wait((textLines) => {
        selectedText = textLines.join('\n');
      }, ignore);
    });

    return () => {
      unsubscribe1?.();
      unsubscribe2?.();
    };
  });
</script>

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <PagePointerProvider
    pageIndex={page.pageIndex}
    pageWidth={page.width}
    pageHeight={page.height}
    rotation={page.rotation}
    scale={page.scale}
  >
    <RenderLayer pageIndex={page.pageIndex} scale={1} class="pointer-events-none" />
    <SelectionLayer pageIndex={page.pageIndex} scale={page.scale} />
  </PagePointerProvider>
{/snippet}

<div>
  <div style="height: 500px; user-select: none">
    <div class="flex h-full flex-col gap-4">
      <div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <button
          onclick={() => selection.provides?.copyToClipboard()}
          disabled={!hasSelection}
          class="flex h-8 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Copy Selected Text"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy Text
        </button>
      </div>
      <div class="relative flex w-full flex-1 overflow-hidden">
        <Viewport class="flex-grow bg-gray-100">
          <Scroller {RenderPageSnippet} />
        </Viewport>
      </div>
    </div>
  </div>
  <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
    <p class="m-0 text-xs font-medium uppercase text-gray-500">Selected Text:</p>
    <div class="mt-2">
      {#if hasSelection}
        <div class="m-0 w-full whitespace-pre-line break-words text-sm text-gray-800">
          {selectedText || 'Loading...'}
        </div>
      {:else}
        <p class="m-0 text-sm italic text-gray-400">Select text in the PDF to see it here</p>
      {/if}
    </div>
  </div>
</div>
