<script lang="ts">
  import { useDocuments, type DocumentInfo } from '@embedpdf/svelte/runtime';

  let { document }: { document: DocumentInfo } = $props();

  const documents = useDocuments();
  let password = $state('');
  let wrong = $state(false);

  async function unlock() {
    try {
      await documents.unlock(document.id, { password });
    } catch {
      wrong = true; // it stays locked; ask again
    }
  }
</script>

<div class="panel">
  <h3>{document.name} needs a password</h3>
  <!-- A password given before (when the file was opened) was wrong too. -->
  {#if wrong || document.passwordProvided}
    <p>That password isn’t right. Try again.</p>
  {/if}
  <div class="actions">
    <input class="field" type="password" aria-label="Password" bind:value={password} />
    <button type="button" class="button" onclick={unlock}>Unlock</button>
  </div>
</div>
