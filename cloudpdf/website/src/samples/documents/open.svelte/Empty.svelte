<!-- The gate's fallback: a document on its way, or none at all. -->
<script lang="ts">
  import { useDocument } from '@embedpdf/svelte/runtime';

  const document = useDocument();
</script>

<p class="loading">
  {document.id ? 'Opening…' : 'No document is open. Open a PDF to see it here.'}
</p>
