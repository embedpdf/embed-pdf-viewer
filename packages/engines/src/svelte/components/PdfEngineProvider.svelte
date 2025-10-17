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

    const contextValue = $derived({
        engine,
        isLoading,
        error
    });

    // Set context (runs during component initialization)
    setPdfEngineContext(contextValue);
</script>

{@render children()}