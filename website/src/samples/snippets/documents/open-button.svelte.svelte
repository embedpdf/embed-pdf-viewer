<script lang="ts">
  import { useDocuments } from '@embedpdf/svelte/runtime';

  const documents = useDocuments();

  async function onPick(file: File) {
    await documents.open({ kind: 'bytes', bytes: await file.arrayBuffer() }, { name: file.name });
  }
</script>

<input
  type="file"
  accept="application/pdf"
  onchange={(event) => onPick(event.currentTarget.files![0])}
/>
