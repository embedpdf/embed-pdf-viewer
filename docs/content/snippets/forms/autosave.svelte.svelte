<script lang="ts">
  import { useFormEvent } from '@embedpdf/svelte/form';
  import { autosave } from './api';

  useFormEvent(
    (form) => form.onValueChanged,
    ({ field }) => autosave(field.name),
  );
</script>
