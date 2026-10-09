<script setup lang="ts">
// The publish check's toolbar: a plugin's API handle and its state, read the documented way.
import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useSearch, useSearchState } from '@embedpdf/vue/search';
import { useForm, useFormState } from '@embedpdf/vue/form';

const search = useSearch();
const { hitCount, activeHitIndex, status } = useSearchState();
const form = useForm();
const { fields } = useFormState();
const text = ref('PDF');

watch(text, (value) => void search.search({ text: value }), { immediate: true });

const hits: Ref<number> = hitCount;
const count = computed(() =>
  status.value === 'searching' ? 'Searching…' : `${activeHitIndex.value + 1} of ${hits.value}`,
);

async function addField(
  page: NonNullable<Parameters<typeof form.create>[0]['widgets']>[number]['page'],
) {
  await form.create({
    family: 'text',
    name: 'name',
    widgets: [{ page, rect: { x: 72, y: 540, width: 240, height: 24 } }],
  });
}
defineExpose({ addField });
</script>

<template>
  <div class="toolbar">
    <input v-model="text" type="search" aria-label="Search" />
    <output>{{ count }} · {{ fields.length }} fields</output>
    <button type="button" :disabled="hitCount === 0" @click="search.nextHit()">↓</button>
  </div>
</template>
