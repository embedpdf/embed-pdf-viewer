<script lang="ts">
  import { useFormState } from '@embedpdf/svelte/form';

  const formState = useFormState();
</script>

<div class="toolbar">
  <output class="readout">{formState.fields.length} fields: click one and fill it in</output>
</div>
