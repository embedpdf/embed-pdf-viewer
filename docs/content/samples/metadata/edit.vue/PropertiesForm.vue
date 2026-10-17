<!-- A properties form: the inputs start with what the file says, and Save writes them back. -->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { DocumentMetadata } from '@embedpdf/vue/runtime';
import { useMetadata, useMetadataEvent, useMetadataState } from '@embedpdf/vue/metadata';

const props = defineProps<{ initial: DocumentMetadata }>();

const EDITABLE = ['title', 'author', 'subject', 'keywords'] as const;
type Draft = Record<(typeof EDITABLE)[number], string>;

const metadata = useMetadata();
const modifiedAt = useMetadataState((state) => state.metadata?.modifiedAt ?? null);
const draft = reactive<Draft>({
  title: props.initial.title ?? '',
  author: props.initial.author ?? '',
  subject: props.initial.subject ?? '',
  keywords: props.initial.keywords ?? '',
});
const changes = ref<string[]>([]);

// Every change to the standard fields, by you or anyone else.
useMetadataEvent(
  (capability) => capability.onUpdated,
  ({ changedKeys, origin }) => {
    changes.value = [
      `${changedKeys.join(', ')} changed ${origin.kind === 'local' ? 'here' : 'elsewhere'}`,
      ...changes.value,
    ];
  },
);

const canUpdate = computed(() => metadata.canUpdate());
// An empty field removes it: null, not ''.
function save() {
  void metadata.update({
    title: draft.title.trim() || null,
    author: draft.author.trim() || null,
    subject: draft.subject.trim() || null,
    keywords: draft.keywords.trim() || null,
  });
}
</script>

<template>
  <div class="layout">
    <form class="form" @submit.prevent="save">
      <label v-for="key in EDITABLE" :key="key" class="row">
        <span class="name">{{ key }}</span>
        <input v-model="draft[key]" class="field" :disabled="!canUpdate" placeholder="not set" />
      </label>
      <div class="actions">
        <button type="submit" class="button primary" :disabled="!canUpdate">Save</button>
        <button
          type="button"
          class="button"
          :disabled="!canUpdate"
          @click="metadata.update({ modifiedAt: new Date() })"
        >
          Set the modified date to now
        </button>
      </div>
    </form>
    <section class="changes" aria-live="polite">
      <h3 class="changes-title">Changes</h3>
      <p class="modified">
        Last changed: {{ modifiedAt ? new Date(modifiedAt).toLocaleString() : 'not set' }}
      </p>
      <p v-if="changes.length === 0" class="empty">Edit a field and save.</p>
      <ul v-else class="log">
        <li v-for="(change, index) in changes" :key="changes.length - index">{{ change }}</li>
      </ul>
    </section>
  </div>
</template>
