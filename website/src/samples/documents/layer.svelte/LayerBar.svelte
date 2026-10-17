<script lang="ts">
  import { useDocument, useDocuments, type OpenInput } from '@embedpdf/svelte/runtime';
  import { useMetadata, useMetadataState } from '@embedpdf/svelte/metadata';

  let {
    withLayer,
    reopened,
    onReopened,
  }: {
    withLayer: (layer?: Uint8Array) => Promise<OpenInput>;
    reopened: boolean;
    onReopened: () => void;
  } = $props();

  const documents = useDocuments();
  const metadata = useMetadata();
  const title = useMetadataState((fields) => fields.metadata?.title ?? '');
  const document = useDocument();
  let layer = $state<Uint8Array | null>(null);

  // A change on load, so the layer has something in it. Opened again, the title comes from it.
  $effect(() => {
    if (!reopened) void metadata.update({ title: 'Reviewed by Dana' });
  });

  // Only the changes, as bytes you could store next to the original.
  async function keepChanges() {
    layer = await documents.downloadLayer();
  }

  // Later: the original again, with the stored changes on top.
  async function openAgain() {
    if (!layer) return;
    const stored = layer;
    await documents.close(document.id);
    onReopened();
    await documents.open(() => withLayer(stored), { name: 'ebook.pdf' });
  }
</script>

<div class="toolbar">
  <input
    class="field"
    aria-label="Title"
    value={title.current}
    onblur={(event) => metadata.update({ title: event.currentTarget.value })}
  />
  <button type="button" class="button" onclick={keepChanges}>Keep the changes</button>
  <button type="button" class="button" disabled={!layer} onclick={openAgain}>
    Open again with them
  </button>
</div>
<p class="note">
  {#if reopened}
    Opened again: the original, with the title from the stored layer.
  {:else if layer}
    The layer holds the changes in {layer.byteLength.toLocaleString()} bytes.
  {:else}
    Change the title, then keep the changes.
  {/if}
</p>
