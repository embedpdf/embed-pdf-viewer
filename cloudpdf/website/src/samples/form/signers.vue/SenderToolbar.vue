<!-- The sender picks who the next field is for, then a tool, and clicks the page. -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';
import { useForm, useFormState } from '@embedpdf/vue/form';

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-signature', 'Signature'],
] as const;

const form = useForm();
const interaction = useInteraction();
const { groups, designGroup } = useFormState();
const { activeToolId } = useInteractionState();

// Start by placing text fields for the first signer.
onMounted(() => {
  form.setDesignGroup('borrower');
  interaction.activateTool('form-text');
});
</script>

<template>
  <div class="toolbar">
    <span class="label">Next field is for</span>
    <button
      v-for="group in groups"
      :key="group.id"
      type="button"
      class="button"
      :aria-pressed="designGroup === group.id"
      :disabled="!form.canSetGroup(group.id)"
      @click="form.setDesignGroup(group.id)"
    >
      <i class="swatch" :style="{ background: group.color }" />{{ group.label ?? group.id }}
    </button>
    <span class="divider" />
    <button
      v-for="[id, label] in FIELD_TOOLS"
      :key="id"
      type="button"
      class="button"
      :aria-pressed="activeToolId === id"
      @click="interaction.activateTool(id)"
    >
      {{ label }}
    </button>
  </div>
</template>
