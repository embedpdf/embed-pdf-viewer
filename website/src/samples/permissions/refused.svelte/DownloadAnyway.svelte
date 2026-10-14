<script lang="ts">
  import { onMount } from 'svelte';
  import { isPluginError, useDocuments } from '@embedpdf/svelte/runtime';

  type Result =
    | { kind: 'downloaded'; bytes: number }
    | { kind: 'refused'; code: string; permission: string | null };

  const documents = useDocuments();
  let result = $state<Result | null>(null);

  async function download() {
    try {
      const bytes = await documents.download();
      result = { kind: 'downloaded', bytes: bytes.byteLength };
    } catch (error) {
      if (isPluginError(error, 'permission-denied')) {
        result = { kind: 'refused', code: error.code, permission: error.permission };
      }
    }
  }

  // On load, the call the button makes, so the refusal shows at once.
  onMount(() => {
    void download();
  });
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={download}>Download anyway</button>
  <output class="result">
    {#if result?.kind === 'downloaded'}
      Downloaded {result.bytes} bytes.
    {:else if result?.kind === 'refused'}
      Refused: <code>{result.code}</code>, missing <code>{result.permission}</code>
    {/if}
  </output>
</div>
