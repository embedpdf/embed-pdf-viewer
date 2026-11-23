<!-- FieldTag.vue -->
<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { useForm, useFormWidgetAnchor, type FormField } from '@embedpdf/vue/form';

const props = defineProps<{ field: FormField }>();

// A tag beside the first box of a field.
const form = useForm();
const anchor = useFormWidgetAnchor(() => form.getWidgets(props.field.ref)[0]?.ref ?? null);
</script>

<template>
  <Anchored :anchor="anchor" placement="left" :gap="4" pinned>
    <span class="tag"><slot /></span>
  </Anchored>
</template>
