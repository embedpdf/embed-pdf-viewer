<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDocument, useDocuments } from '@embedpdf/vue/runtime';
import type { OpenSource } from '@embedpdf/vue/runtime';
import type { Role } from './roles';

const props = defineProps<{ ebook: OpenSource }>();
const role = defineModel<Role>('role', { required: true });

const documents = useDocuments();
const { id } = useDocument();
// The role the open document was opened with: it keeps that one.
const openedAs = ref(role.value);

// The checks belong to the open document: read them again whenever another one opens.
const canDownload = computed(() => id.value !== '' && documents.canDownload());
const canPrint = computed(() => id.value !== '' && documents.canPrint());

async function openAgain() {
  await documents.close(id.value);
  await documents.open(props.ebook, { name: 'ebook.pdf' });
  openedAs.value = role.value;
}
</script>

<template>
  <div class="toolbar">
    <label class="label">
      Dana Smith, as
      <select v-model="role" class="select">
        <option value="reader">reader</option>
        <option value="editor">editor</option>
      </select>
    </label>
    <span class="check" :data-allowed="canDownload">Download</span>
    <span class="check" :data-allowed="canPrint">Print</span>
  </div>
  <p class="note">
    This document opened for a {{ openedAs }}.
    <button v-if="openedAs !== role" type="button" class="button" @click="openAgain">
      Open it again as {{ role }}
    </button>
  </p>
</template>
