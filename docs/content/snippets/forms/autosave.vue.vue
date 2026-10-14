<script setup lang="ts">
import { useFormEvent } from '@embedpdf/vue/form';
import { autosave } from './api';

useFormEvent(
  (form) => form.onValueChanged,
  ({ field }) => autosave(field.name),
);
</script>
