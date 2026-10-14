<!-- The document's properties, the way a "Document properties" dialog shows them. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useMetadataState } from '@embedpdf/vue/metadata';

const FIELDS = [
  ['title', 'Title'],
  ['author', 'Author'],
  ['subject', 'Subject'],
  ['keywords', 'Keywords'],
  ['creator', 'Made in'],
  ['producer', 'Turned into a PDF by'],
  ['createdAt', 'Created'],
  ['modifiedAt', 'Last changed'],
  ['trapped', 'Trapped'],
] as const;

// Dates are ISO strings: show them in the reader's own format.
const DATES: ReadonlySet<string> = new Set(['createdAt', 'modifiedAt']);
const show = (field: string, value: string | null) => {
  if (value === null) return null;
  return DATES.has(field) ? new Date(value).toLocaleString() : value;
};

const { metadata, status } = useMetadataState();

const rows = computed(() =>
  FIELDS.map(([field, label]) => ({
    field,
    label,
    value: metadata.value ? show(field, metadata.value[field]) : null,
  })),
);
</script>

<template>
  <section class="panel">
    <header class="panel-header">
      <h3 class="panel-title">Document properties</h3>
      <span class="status" :data-status="status">{{ status }}</span>
    </header>
    <dl class="properties">
      <div v-for="row in rows" :key="row.field" class="property">
        <dt>{{ row.label }}</dt>
        <dd :class="row.value === null ? 'unset' : undefined">{{ row.value ?? 'not set' }}</dd>
      </div>
    </dl>
  </section>
</template>
