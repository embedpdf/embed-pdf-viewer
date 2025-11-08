<script lang="ts">
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { usePrintCapability } from '@embedpdf/plugin-print/svelte';

  const print = usePrintCapability();
  let isPrinting = $state(false);

  const handlePrint = () => {
    if (!print.provides || isPrinting) return;
    isPrinting = true;
    const printTask = print.provides.print();
    printTask.wait(
      () => {
        isPrinting = false;
      },
      () => {
        isPrinting = false;
      },
    );
  };
</script>

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <div style:width={`${page.width}px`} style:height={`${page.height}px`} style:position="relative">
    <RenderLayer pageIndex={page.pageIndex} scale={page.scale} />
  </div>
{/snippet}

<div style="height: 500px">
  <div class="flex h-full flex-col">
    <div
      class="mb-4 mt-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      <button
        onclick={handlePrint}
        disabled={!print.provides || isPrinting}
        class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-colors duration-150 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="Print Document"
      >
        {#if isPrinting}
          <svg
            class="h-5 w-5 animate-spin text-gray-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        {:else}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2"
            />
            <path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" />
            <path
              d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z"
            />
          </svg>
        {/if}
      </button>
    </div>
    <div class="flex-grow" style="position: relative">
      <Viewport
        style="
          background-color: #f1f3f5;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        "
      >
        <Scroller {RenderPageSnippet} />
      </Viewport>
    </div>
  </div>
</div>
