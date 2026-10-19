<script lang="ts">
  import { useDocuments, type DocumentInfo } from '@embedpdf/svelte/runtime';
  import PasswordPrompt from './PasswordPrompt.svelte';

  let { document }: { document: DocumentInfo } = $props();
  const documents = useDocuments();
  let wrong = $state(false);

  async function submit(password: string) {
    try {
      await documents.unlock(document.id, { password });
    } catch {
      wrong = true; // it stays locked; ask again
    }
  }
</script>

<PasswordPrompt onSubmit={submit} {wrong} />
