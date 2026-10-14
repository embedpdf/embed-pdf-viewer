<!-- The bundle as one JSON text: what you'd store in your own database. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import {
    AnnotationTransfer,
    useAnnotation,
    useAnnotationList,
    useAnnotationState,
  } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();
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

  // On load: a note and a rectangle on the cover, exported at once.
  let started = false;
  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || started) return;
    started = true;
    untrack(() => {
      void Promise.all([
        annotation.create(cover, {
          subtype: 'text',
          rect: { x: 470, y: 232, width: 20, height: 20 },
          contents: 'Can we shorten the title?',
          color: '#facc15',
        }),
        annotation.create(cover, {
          subtype: 'square',
          box: { x: 96, y: 506, width: 178, height: 54 },
          color: '#e5484d',
          strokeWidth: 3,
        }),
      ]).then(exportAll);
    });
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
