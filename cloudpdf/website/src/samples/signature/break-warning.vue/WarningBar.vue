<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation } from '@embedpdf/vue/annotation';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import { useStamp } from '@embedpdf/vue/stamp';
import { useSignature, useSignatureEvent, useSignatureState } from '@embedpdf/vue/signature';

/** On load: a signature field on the last page, signed by Ada with a typed signature. */
function useSignedDocument() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const signature = useSignature();
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
          widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 } }],
        });
        stage.goToPage(page);
        const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
        const { asset } = await stamp.createAsset({
          libraryId: library.id,
          name: 'signature',
          label: 'Signature',
          mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
        });
        await signature.sign({ field: toFieldRef('approval'), mark: { assetId: asset.id } });
      })();
    },
    { immediate: true },
  );
}

useSignedDocument();
const annotation = useAnnotation();
const signature = useSignature();
const pages = usePageList();
const lastPage = computed(() => pages.value.at(-1)?.ref);
const { signatures } = useSignatureState();
const warning = ref<string | null>(null);
const signed = computed(() => signatures.value[0]);

// The moment a change would break a signature once it's saved, as Acrobat warns.
useSignatureEvent(
  (plugin) => plugin.onInvalidationPredicted,
  ({ field }) => {
    const name = signature.getSignature(field)?.fieldName;
    warning.value = `This change will break the signature in "${name}" when saved.`;
  },
);

function drawBox() {
  if (!lastPage.value) return;
  void annotation.create(lastPage.value, {
    subtype: 'square',
    box: { x: 320, y: 560, width: 140, height: 64 },
    color: '#e11d48',
    strokeWidth: 2,
  });
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!signed || !lastPage" @click="drawBox">
      Draw a box on the page
    </button>
    <output class="readout">
      {{
        signed
          ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`
          : 'Signing…'
      }}
    </output>
    <output v-if="warning" class="warning">{{ warning }}</output>
  </div>
</template>
