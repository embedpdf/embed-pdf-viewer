<!-- Your own fields, kept in the document: add one, change one, remove one. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { isPluginError } from '@embedpdf/vue/runtime';
import { useMetadata, useMetadataState } from '@embedpdf/vue/metadata';

const metadata = useMetadata();
const { custom } = useMetadataState();
const name = ref('');
const value = ref('');
const error = ref<string | null>(null);

// Two fields of our own, written on load. Setting the same values again changes nothing.
onMounted(() => {
  void metadata.custom.update({ contractId: 'C-2026-114', reviewedBy: 'dana' });
});

const canUpdate = computed(() => metadata.canUpdate());

async function add() {
  try {
    await metadata.custom.update({ [name.value.trim()]: value.value });
    name.value = '';
    value.value = '';
    error.value = null;
  } catch (failure) {
    // A name the PDF can't take, such as one of the standard fields.
    if (isPluginError(failure, 'invalid-input')) error.value = failure.message;
    else throw failure;
  }
}
</script>

<template>
  <section class="panel">
    <table class="fields">
      <thead>
        <tr>
          <th>Name</th>
          <th>Value</th>
          <th aria-label="Remove" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="[key, text] in Object.entries(custom ?? {})" :key="key">
          <td class="key">{{ key }}</td>
          <td>{{ text }}</td>
          <td>
            <!-- null removes a field; the others stay as they are. -->
            <button
              type="button"
              class="button quiet"
              :disabled="!canUpdate"
              @click="metadata.custom.update({ [key]: null })"
            >
              Remove
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <form class="add" @submit.prevent="add">
      <input
        v-model="name"
        class="field"
        aria-label="Name"
        placeholder="Name, such as approvedOn"
      />
      <input v-model="value" class="field" aria-label="Value" placeholder="Value" />
      <button type="submit" class="button" :disabled="!canUpdate || !name.trim()">Add</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
