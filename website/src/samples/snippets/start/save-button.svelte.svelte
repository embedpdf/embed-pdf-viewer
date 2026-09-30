<script lang="ts">
  import { saveFile, useDocuments } from '@embedpdf/svelte/runtime';

  const documents = useDocuments();

  async function save() {
    saveFile(await documents.download(), 'reviewed.pdf');
  }
</script>

<button onclick={save}>Save</button>
