<!-- What the form refused last, so a mistyped date says why. -->
<script lang="ts">
  import { useFormEvent } from '@embedpdf/svelte/form';

  let refused = $state<string | null>(null);
  useFormEvent(
    (form) => form.onValidationRejected,
    ({ issues }) => (refused = issues[0]?.message ?? 'The form refused that value.'),
  );
  useFormEvent(
    (form) => form.onValueChanged,
    () => (refused = null),
  );
</script>

<div class="toolbar">
  <output class="readout">{refused ?? 'Click the order date, or type one.'}</output>
</div>
