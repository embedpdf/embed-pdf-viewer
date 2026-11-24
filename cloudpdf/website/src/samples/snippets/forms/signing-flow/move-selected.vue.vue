<script setup lang="ts">
import { useForm, useFormState } from '@embedpdf/vue/form';

const form = useForm();
const { groups, selectedFields } = useFormState();

const give = (groupId: string) =>
  form.moveToGroup(
    selectedFields.value.map((field) => field.ref),
    groupId,
  );
</script>

<template>
  <template v-if="selectedFields.length > 0">
    Give to
    <button
      v-for="group in groups"
      :key="group.id"
      :disabled="!form.canSetGroup(group.id)"
      @click="give(group.id)"
    >
      <i :style="{ background: group.color }" /> {{ group.label ?? group.id }}
    </button>
  </template>
</template>
