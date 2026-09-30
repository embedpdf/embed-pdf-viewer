<script lang="ts">
  import { useMetadataState } from '@embedpdf/svelte/metadata';

  const state = useMetadataState(); // state.custom is { contractId: 'C-2026-114', reviewedBy: 'dana' }
</script>

<span>Contract {state.custom?.contractId}</span>
