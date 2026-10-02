<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm, useFormState } from '@embedpdf/vue/form';
import { useStamp } from '@embedpdf/vue/stamp';
import { useSignature, useSignatureState, useSignerRows } from '@embedpdf/vue/signature';
import MarkButton from './MarkButton.vue';

/**
 * The ebook has no signature field, and the browser holds no signatures yet:
 * add a field to the last page, and one person with a typed signature.
 */
function useSetUp() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const pages = usePageList();
  const lastPage = computed(() => pages.value.at(-1)?.ref);
  let done = false;

  watch(
    [status, lastPage],
    ([current, page]) => {
      if (current !== 'ready' || !page || done) return;
      done = true;
      void (async () => {
        await form.create({
          family: 'signature',
          name: 'approval',
          widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 }, color: '#94a3b8' }],
        });
        stage.goToPage(page);
        const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
        await stamp.createAsset({
          libraryId: library.id,
          name: 'signature',
          label: 'Signature',
          mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
        });
      })();
    },
    { immediate: true },
  );
}

useSetUp();
const signature = useSignature();
const rows = useSignerRows();
const person = computed(() => rows.value[0]);
const { signatures, target, busy } = useSignatureState();
const field = useFormState((state) =>
  state.fields.find((candidate) => candidate.family === 'signature'),
);
const error = ref<string | null>(null);
const signed = computed(() => signatures.value[0]);

// The target is the field someone clicked; without one, the form's signature field.
function sign(assetId: string) {
  const destination = target.value ?? field.value?.ref;
  if (!destination) return;
  error.value = null;
  signature
    .placeMark({ assetId }, { field: destination })
    .catch((reason: Error) => (error.value = reason.message));
}

const status = computed(() => {
  if (!person.value || !field.value) return 'Getting ready…';
  if (error.value) return error.value;
  if (busy.value) return 'Signing…';
  if (signed.value) {
    return `Signed by ${signed.value.signer.name}: ${signed.value.verdict?.summary ?? 'checking…'}`;
  }
  if (target.value) return 'Now pick the signature';
  return 'Click the field, or pick the signature';
});
</script>

<template>
  <div class="toolbar">
    <MarkButton
      v-for="asset in person?.signatures"
      :key="asset.id"
      :asset-id="asset.id"
      :label="asset.label"
      @pick="sign(asset.id)"
    />
    <output class="readout">{{ status }}</output>
  </div>
</template>
