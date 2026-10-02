<script lang="ts">
  import { saveFile, useDocuments } from '@embedpdf/svelte/runtime';

  const documents = useDocuments();

  async function download() {
    saveFile(await documents.download(), 'contract.pdf');
  }
</script>

<button onclick={download}>Download</button>
