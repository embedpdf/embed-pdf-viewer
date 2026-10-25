<!-- The bundle as one JSON text: what you'd store in your own database. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    AnnotationTransfer,
    useAnnotation,
    useAnnotationList,
    useAnnotationState,
  } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const annotations = useAnnotationList();
  let text = $state('');
  let status = $state('');

  async function exportAll() {
    const bundle = await annotation.export(); // everything
    text = AnnotationTransfer.stringify(bundle);
    status = `Exported ${bundle.items.length}`;
  }

  async function deleteAll() {
    await Promise.all(annotation.list().map((each) => annotation.delete(each.ref)));
    status = 'Deleted them all';
  }

  async function importText() {
    try {
      const { annotations: imported, dropped } = await annotation.import(
        await AnnotationTransfer.parse(text),
      );
      status = `Imported ${imported.length}, left out ${dropped.length}`;
    } catch (error) {
      status = error instanceof Error ? error.message : String(error);
    }
  }

  // On load: everything in the document, exported at once.
  let started = false;
  $effect(() => {
    if (!ready.current || started) return;
    started = true;
    untrack(() => void exportAll());
  });
</script>

<div class="panel transfer">
  <div class="toolbar">
    <button type="button" class="button" onclick={() => void exportAll()}>Export</button>
    <button
      type="button"
      class="button"
      disabled={annotations.current.length === 0}
      onclick={() => void deleteAll()}
    >
      Delete all
    </button>
    <button type="button" class="button" disabled={text === ''} onclick={() => void importText()}>
      Import
    </button>
  </div>
  <output class="readout">{status}</output>
  <textarea class="bundle" aria-label="The exported bundle" spellcheck={false} bind:value={text}
  ></textarea>
</div>
