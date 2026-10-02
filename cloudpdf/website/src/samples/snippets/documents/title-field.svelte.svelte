<script lang="ts">
  import { useMetadata, useMetadataState } from '@embedpdf/svelte/metadata';

  const metadata = useMetadata();
  const state = useMetadataState();
</script>

<label>
  Title
  <input
    value={state.metadata?.title ?? ''}
    disabled={!metadata.canUpdate()}
    onblur={(event) => metadata.update({ title: event.currentTarget.value })}
  />
</label>
