<script lang="ts">
  import { useSignatureEvent } from '@embedpdf/svelte/signature';
  import { showWarning } from './warnings';

  useSignatureEvent(
    (signature) => signature.onInvalidationPredicted,
    () => showWarning('Saving this change will break a signature.'),
  );
</script>
