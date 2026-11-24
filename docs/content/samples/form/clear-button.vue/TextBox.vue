<script setup lang="ts">
import { useForm } from '@embedpdf/vue/form';
import type { FieldControlProps } from '@embedpdf/vue/form';

// A text box with a button at its end that empties it. `native` is the layer's own text box:
// the field as the PDF draws it, and the editor people type in. The button is yours.
const props = defineProps<FieldControlProps>();
const form = useForm();

// Empty the box, then put the cursor back in it, ready for the new value.
const clear = () => props.setValue({ value: '' }).then(() => form.focus(props.widget.fieldRef));
</script>

<template>
  <component :is="native" />
  <!-- Tab goes to the text box. -->
  <button
    v-if="widget.control === 'text' && !widget.disabled && widget.value !== ''"
    type="button"
    class="clear-button"
    :aria-label="`Clear ${widget.label}`"
    tabindex="-1"
    @click="clear"
  />
</template>
