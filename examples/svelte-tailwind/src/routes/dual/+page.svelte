<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { ConsoleLogger } from '@embedpdf/models';
  import Panel from './Panel.svelte';
  import RegistryProbe from './RegistryProbe.svelte';

  const logger = new ConsoleLogger();
  const pdfEngine = usePdfiumEngine({ logger });

  // Toggling this unmounts the second <EmbedPDF>. Before the per-instance
  // context fix, the teardown reset the shared object and panel A went blank.
  let showSecond = $state(true);
</script>

<div class="flex h-screen flex-col gap-3 bg-gray-50 p-3">
  <header class="flex items-center gap-4">
    <h1 class="text-sm font-semibold">Two &lt;EmbedPDF&gt; instances, one page</h1>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={showSecond} />
      Mount panel B
    </label>
    <p class="text-xs text-gray-500">
      Each panel should report its own <code>activeDocumentId</code>, and unmounting B should leave
      A untouched.
    </p>
  </header>

  {#if pdfEngine.error}
    <div class="flex flex-1 items-center justify-center">Error: {pdfEngine.error.message}</div>
  {:else if pdfEngine.isLoading || !pdfEngine.engine}
    <div class="flex flex-1 items-center justify-center text-sm text-gray-500">
      Loading PDF engine…
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 gap-3">
      <Panel label="A" url="https://snippet.embedpdf.com/ebook.pdf" engine={pdfEngine.engine} />
      {#if showSecond}
        <Panel label="B" url="https://snippet.embedpdf.com/ebook.pdf" engine={pdfEngine.engine} />
      {/if}
    </div>

    <!--
      Sitting outside every <EmbedPDF>. With the old module-level singleton this
      resolved a live registry by accident; with per-instance context it gets the
      inert fallback and logs a warning. This is the one behaviour the fix breaks.
    -->
    <section class="rounded border border-amber-300 bg-amber-50">
      <header class="px-3 py-2 text-sm font-semibold">
        Probe mounted outside &lt;EmbedPDF&gt; (unsupported)
      </header>
      <RegistryProbe label="outside" />
    </section>
  {/if}
</div>
