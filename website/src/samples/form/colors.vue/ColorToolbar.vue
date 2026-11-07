<script setup lang="ts">
import { useForm, useFormSettings } from '@embedpdf/vue/form';

const COLORS = [
  ['Accent', null],
  ['Orange', '#ea580c'],
  ['Green', '#16a34a'],
] as const;

const form = useForm();
const { fields, focus } = useFormSettings();
</script>

<template>
  <div class="toolbar">
    <span class="label">Edges</span>
    <div class="segments">
      <button
        v-for="[label, color] in COLORS"
        :key="label"
        type="button"
        class="segment"
        :aria-pressed="fields.border === color"
        @click="form.updateSettings({ fields: { border: color } })"
      >
        {{ label }}
      </button>
    </div>
    <span class="label">Focus</span>
    <div class="segments">
      <button
        v-for="[label, color] in COLORS"
        :key="label"
        type="button"
        class="segment"
        :aria-pressed="focus.color === color"
        @click="form.updateSettings({ focus: { color } })"
      >
        {{ label }}
      </button>
    </div>
  </div>
</template>
