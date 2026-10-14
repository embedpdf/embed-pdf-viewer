<script setup lang="ts">
import { useSelectionState } from '@embedpdf/vue/selection';

// Every field of the selection's state, as it changes.
const { hasSelection, isSelecting, range, pages } = useSelectionState();
</script>

<template>
  <dl class="status">
    <div class="field">
      <dt>hasSelection</dt>
      <dd>{{ String(hasSelection) }}</dd>
    </div>
    <div class="field" :data-live="isSelecting">
      <dt>isSelecting</dt>
      <dd>{{ String(isSelecting) }}</dd>
    </div>
    <div class="field">
      <dt>pages</dt>
      <dd>{{ pages.length === 1 ? '1 page' : `${pages.length} pages` }}</dd>
    </div>
    <div class="field">
      <dt>range</dt>
      <dd>{{ range ? `${range.start.index} → ${range.end.index}` : 'null' }}</dd>
    </div>
  </dl>
</template>
