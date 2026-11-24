<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { useForm, useFormWidgetAnchor } from '@embedpdf/vue/form';
import type { FormField } from '@embedpdf/vue/form';

const props = defineProps<{ field: FormField }>();

// A tag beside the first box of a field: pinned, so it stays on the field. A pinned tag keeps
// its size at every zoom, so this one is small: it fits in the page's margin on a phone too.
const form = useForm();
const anchor = useFormWidgetAnchor(() => form.getWidgets(props.field.ref)[0]?.ref ?? null);
</script>

<template>
  <Anchored :anchor="anchor" placement="left" :gap="6" pinned>
    <button
      type="button"
      class="tag"
      title="Required"
      :aria-label="`Required: ${field.alternateName ?? field.name}`"
      @click="form.focus(field.ref)"
    >
      !
    </button>
  </Anchored>
</template>
