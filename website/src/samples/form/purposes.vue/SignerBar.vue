<!-- A signer starts: the app fills in what it knows about them, in their own fields, as one change. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useForm } from '@embedpdf/vue/form';
import { people, type Person } from './people';

defineProps<{ person: Person }>();

const form = useForm();
const filled = ref<number | null>(null);

// Another signer's field is left for them, and so is a field that has a value.
onMounted(() => void form.prefill().then(({ applied }) => (filled.value = applied.length)));
</script>

<template>
  <div class="toolbar">
    <output class="readout">
      {{
        filled === null
          ? 'Filling in what the app knows…'
          : `Filled in for ${people[person].name}: ${filled} ${filled === 1 ? 'field' : 'fields'}`
      }}
    </output>
  </div>
</template>
