<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { useForm, useFormWidgetAnchor } from '@embedpdf/vue/form';
import type { FormField } from '@embedpdf/vue/form';

const props = defineProps<{ field: FormField }>();

// A tag beside the first box of a field: pinned, so it stays on the field.
const form = useForm();
const anchor = useFormWidgetAnchor(() => form.getWidgets(props.field.ref)[0]?.ref ?? null);
</script>

<template>
  <Anchored :anchor="anchor" placement="left" :gap="6" pinned>
    <button type="button" class="tag" @click="form.focus(field.ref)">Required</button>
  </Anchored>
</template>
