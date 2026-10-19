<script lang="ts">
  import { useSignatureState } from '@embedpdf/svelte/signature';

  const state = useSignatureState();
</script>

<ul>
  {#each state.signatures as sig (sig.fieldName)}
    <li>{sig.fieldName}: {sig.verdict?.summary ?? 'checking…'}</li>
  {/each}
</ul>
