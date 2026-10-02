<!-- The annotations are part of the document: the downloaded PDF has every one. -->
<script lang="ts">
  import { saveFile, useDocument, useDocuments } from '@embedpdf/svelte/runtime';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';

  const documents = useDocuments();
  const interaction = useInteraction();
  const activeToolId = useInteractionState((state) => state.activeToolId);
  const hasUnsavedChanges = useDocument((document) => document.hasUnsavedChanges);

  async function download() {
    saveFile(await documents.download(), 'ebook-annotated.pdf');
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    aria-pressed={activeToolId.current === 'ink'}
    onclick={() => interaction.activateTool(activeToolId.current === 'ink' ? 'pointer' : 'ink')}
  >
    Pen
  </button>
  <button type="button" class="button" onclick={download}>Download the PDF</button>
  <span class="spacer"></span>
  <output class="readout">{hasUnsavedChanges.current ? 'Unsaved changes' : 'All saved'}</output>
</div>
