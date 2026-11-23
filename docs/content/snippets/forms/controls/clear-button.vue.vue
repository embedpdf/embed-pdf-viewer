<!-- TextBox.vue -->
<script setup lang="ts">
import { useForm, type FieldControlProps } from '@embedpdf/vue/form';

const props = defineProps<FieldControlProps>();
const form = useForm();

// Empty the box, then put the cursor back in it, ready for the new value.
const clear = () => props.setValue({ value: '' }).then(() => form.focus(props.widget.fieldRef));
</script>

<template>
  <!-- The layer's own text box, and a button at its end that empties it. -->
  <component :is="native" />
  <!-- Tab goes to the text box. -->
  <button
    v-if="widget.control === 'text' && !widget.disabled && widget.value !== ''"
    class="clear-button"
    :aria-label="`Clear ${widget.label}`"
    tabindex="-1"
    @click="clear"
  />
</template>
