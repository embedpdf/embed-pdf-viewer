<!-- A `<DocumentGate>` with every snippet, for tests. -->
<script lang="ts">
  import { DocumentGate } from '../../src/runtime';
</script>

<DocumentGate>
  {#snippet fallback()}<p>opening</p>{/snippet}
  {#snippet locked(document)}<p>locked {String(document.passwordProvided)}</p>{/snippet}
  {#snippet error(document)}<p>failed: {document.error.message}</p>{/snippet}
  <p>ready</p>
</DocumentGate>
