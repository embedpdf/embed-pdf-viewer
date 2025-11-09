<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/svelte';

  let { documentId }: { documentId: string } = $props();

  const spread = useSpread(() => documentId);

  const modes = [
    { label: 'Single Page', value: SpreadMode.None },
    { label: 'Two-Page (Odd)', value: SpreadMode.Odd },
    { label: 'Two-Page (Even)', value: SpreadMode.Even },
  ];
</script>

{#snippet renderPage(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer {documentId} pageIndex={page.pageIndex} scale={1} />
  </div>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    {#if spread.provides}
      <div
        class="mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
      >
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600">Page Layout</span>
        <div class="h-6 w-px bg-gray-200"></div>
        <div class="flex items-center gap-2">
          {#each modes as mode}
            <button
              onclick={() => spread.provides?.setSpreadMode(mode.value)}
              class:bg-blue-500={spread.spreadMode === mode.value}
              class:text-white={spread.spreadMode === mode.value}
              class:bg-gray-100={spread.spreadMode !== mode.value}
              class:text-gray-700={spread.spreadMode !== mode.value}
              class:hover:bg-gray-200={spread.spreadMode !== mode.value}
              class="rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150"
            >
              {mode.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    <div class="flex-grow" style="position: relative">
      <Viewport
        {documentId}
        style="
          background-color: #f1f3f5;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        "
      >
        <Scroller {documentId} {renderPage} />
      </Viewport>
    </div>
  </div>
</div>
