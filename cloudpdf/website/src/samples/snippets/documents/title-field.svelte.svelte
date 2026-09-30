<script lang="ts">
  import { useMetadata, useMetadataState } from '@embedpdf/svelte/metadata';

  const { update, canUpdate } = useMetadata();
  const state = useMetadataState();
</script>

<label>
  Title
  <input
    value={state.metadata?.title ?? ''}
    disabled={!canUpdate()}
    onblur={(event) => update({ title: event.currentTarget.value })}
  />
</label>
