<!--
  A document keeps the permissions it opened with, so the next person opens the saved form again.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useDocument, useDocuments } from '@embedpdf/svelte/runtime';
  import type { Person } from './people';

  let { person }: { person: Person } = $props();

  const documents = useDocuments();
  const document = useDocument();
  // The person the open document was opened for.
  let opened = untrack(() => person);

  async function openAgain(id: string) {
    const bytes = await documents.download();
    await documents.close(id);
    await documents.open({ kind: 'bytes', bytes }, { name: 'equipment-loan.pdf' });
  }

  $effect(() => {
    const id = document.id;
    if (person === opened || !id) return;
    opened = person;
    void openAgain(id);
  });
</script>
