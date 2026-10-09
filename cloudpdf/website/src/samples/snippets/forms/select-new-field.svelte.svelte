<script lang="ts">
  import { useFormEvent } from '@embedpdf/svelte/form';
  import { selectField } from './editor';

  useFormEvent(
    (form) => form.onFieldCreated,
    ({ field }) => selectField(field),
  );
</script>
