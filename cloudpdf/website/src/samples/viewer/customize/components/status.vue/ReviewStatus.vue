<script setup lang="ts">
const status = defineModel<string>({ required: true });
</script>

<template>
  <label class="status" :data-status="status">
    <span class="dot" />
    <select v-model="status" aria-label="Review status">
      <option value="draft">Draft</option>
      <option value="review">In review</option>
      <option value="approved">Approved</option>
    </select>
  </label>
</template>
