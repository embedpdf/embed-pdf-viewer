<!-- The amounts and the total are calculated by the form's scripts. -->
<script lang="ts">
  import { toFieldRef, useFormEvent, useFormValue } from '@embedpdf/svelte/form';

  const total = useFormValue(toFieldRef('invoice.total'));
  let refused = $state<string | null>(null);

  // A script refused a value, such as a date that isn't day/month/year.
  useFormEvent(
    (form) => form.onValidationRejected,
    ({ field, issues }) => (refused = `${field.name}: ${issues[0]?.message ?? 'refused'}`),
  );
</script>

<div class="toolbar">
  <output class="readout">
    Total: {total.current && 'value' in total.current && total.current.value
      ? total.current.value
      : 'type a quantity'}
  </output>
  {#if refused}<output class="refused">{refused}</output>{/if}
</div>
