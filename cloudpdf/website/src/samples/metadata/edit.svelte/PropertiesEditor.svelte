<!-- The form starts once the properties have been read from the file. -->
<script lang="ts">
  import { useMetadataState } from '@embedpdf/svelte/metadata';
  import PropertiesForm from './PropertiesForm.svelte';

  const fields = useMetadataState((state) => state.metadata);
</script>

{#if fields.current}
  <PropertiesForm initial={fields.current} />
{:else}
  <p class="loading">Reading…</p>
{/if}
