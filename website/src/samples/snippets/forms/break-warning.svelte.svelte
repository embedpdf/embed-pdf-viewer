<script lang="ts">
  import { useSignature, useSignatureEvent } from '@embedpdf/svelte/signature';
  import { toast } from './toast';

  const signature = useSignature();

  useSignatureEvent(
    (s) => s.onInvalidationPredicted,
    ({ field }) => {
      const name = signature.getSignature(field)?.fieldName;
      toast(`This change will break the signature in "${name}" when saved.`);
    },
  );
</script>
