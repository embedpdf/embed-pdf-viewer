<script setup lang="ts">
import { Button, Icon } from '@cloudpdf/viewer-vue';
import { useReview } from './review'; // your app

const { notesShown, toggleNotes, saved } = useReview();
</script>

<template>
  <span class="review">
    <Button icon="message" label="Notes" :active="notesShown" @click="toggleNotes" />
    <span v-if="saved" class="saved"><Icon name="check" :size="16" /> Saved</span>
  </span>
</template>
