<script lang="ts">
  import { DocumentGate, DocumentScope, useDocumentsState } from '@embedpdf/svelte/runtime';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import Header from './Header.svelte';

  const open = useDocumentsState();
</script>

<div class="split">
  {#each open.documents as document (document.id)}
    <section class="pane">
      <DocumentScope id={document.id}>
        <DocumentGate>
          {#snippet fallback()}
            <p class="loading">Opening…</p>
          {/snippet}
          <Header />
          <Stage class="stage">
            <RenderLayer />
          </Stage>
        </DocumentGate>
      </DocumentScope>
    </section>
  {/each}
</div>
