<script lang="ts">
  import { PDFViewer } from '@cloudpdf/viewer-svelte';
  import { fetchDocumentToken } from './api'; // your backend: a token for this user and document

  let { contracts }: { contracts: { id: string; name: string }[] } = $props();
  let id = $state<string>();
  // A new src opens the picked document; the same one keeps it open.
  const src = $derived.by(() => {
    const picked = id ?? contracts[0]?.id;
    return picked ? { token: () => fetchDocumentToken(picked) } : null;
  });
</script>

<select bind:value={id}>
  {#each contracts as contract (contract.id)}
    <option value={contract.id}>{contract.name}</option>
  {/each}
</select>
<PDFViewer {src} style="height: 80vh" />
