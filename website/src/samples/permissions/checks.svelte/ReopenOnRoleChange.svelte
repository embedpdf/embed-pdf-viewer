<!-- A document keeps the permissions it opened with, so a new role opens it again. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useDocument, useDocuments, type OpenSource } from '@embedpdf/svelte/runtime';

  let { role, ebook }: { role: string; ebook: OpenSource } = $props();

  const documents = useDocuments();
  const document = useDocument();
  // The role the open document was opened with.
  let opened = untrack(() => role);

  $effect(() => {
    const id = document.id;
    if (role === opened || !id) return;
    opened = role;
    void documents.close(id).then(() => documents.open(ebook, { name: 'ebook.pdf' }));
  });
</script>
