<script setup lang="ts">
import { useFormEvent } from '@embedpdf/vue/form';
import { selectField } from './editor';

useFormEvent(
  (form) => form.onFieldCreated,
  ({ field }) => selectField(field),
);
</script>
