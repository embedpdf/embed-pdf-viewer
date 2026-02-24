<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PdfEngine } from '@embedpdf/models';
  import { setPdfEngineContext } from '../context';

  interface Props {
    children: Snippet;
    engine: PdfEngine | null;
    isLoading: boolean;
    error: Error | null;
  }

  let { children, engine, isLoading, error }: Props = $props();

  // Update context reactively whenever props change
  $effect(() => {
    setPdfEngineContext({
      engine,
      isLoading,
      error,
    });
  });
</script>

{@render children()}
