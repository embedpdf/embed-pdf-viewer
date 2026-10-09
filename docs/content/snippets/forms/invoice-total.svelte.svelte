<script lang="ts">
  import { toFieldRef, useFormValue } from '@embedpdf/svelte/form';

  const total = useFormValue(toFieldRef('invoice.total'));
</script>

{#if total.current && 'value' in total.current}
  <output>{total.current.value}</output>
{/if}
