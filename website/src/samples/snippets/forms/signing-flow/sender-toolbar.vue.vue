<script setup lang="ts">
import { useForm, useFormState } from '@embedpdf/vue/form';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-signature', 'Signature'],
] as const;

const form = useForm();
const { groups, designGroup } = useFormState();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();
</script>

<template>
  <button
    v-for="group in groups"
    :key="group.id"
    :aria-pressed="designGroup === group.id"
    :disabled="!form.canSetGroup(group.id)"
    @click="form.setDesignGroup(group.id)"
  >
    <i :style="{ background: group.color }" /> {{ group.label ?? group.id }}
  </button>

  <button
    v-for="[id, label] in FIELD_TOOLS"
    :key="id"
    :aria-pressed="activeToolId === id"
    @click="interaction.activateTool(id)"
  >
    {{ label }}
  </button>
</template>
