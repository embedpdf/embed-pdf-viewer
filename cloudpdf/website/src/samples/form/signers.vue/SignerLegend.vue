<!-- A signer sees whose field is whose: theirs stand out, and the others take no input. -->
<script setup lang="ts">
import { useFormState } from '@embedpdf/vue/form';
import { people, type Person } from './people';

defineProps<{ person: Person }>();

const { groups, fields } = useFormState();
</script>

<template>
  <div class="toolbar">
    <span v-for="group in groups" :key="group.id" class="legend">
      <i class="swatch" :style="{ background: group.color }" />
      {{ group.label ?? group.id }}:
      {{ fields.filter((field) => field.groupId === group.id).length }}
    </span>
    <output class="readout">{{ people[person].name }} fills in the fields in their color</output>
  </div>
</template>
