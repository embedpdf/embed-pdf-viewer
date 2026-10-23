<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation } from '@embedpdf/vue/annotation';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import { useStamp } from '@embedpdf/vue/stamp';
import { useSignature, useSignatureEvent, useSignatureState } from '@embedpdf/vue/signature';

/** On load: the agreement, with its signature field signed by Ada with a typed signature. */
function useSignedDocument() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const signature = useSignature();
  const status = useFormState((state) => state.status);
  let done = false;

  watch(
    status,
    (current) => {
      if (current !== 'ready' || done) return;
      done = true;
      void (async () => {
        // Bring the agreement's signature field into view.
        const [widget] = form.getWidgets(toFieldRef('approval'));
        if (widget) stage.reveal(widget.page, { rect: widget.rect });
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
const form = useForm();
const { signatures } = useSignatureState();
const warning = ref<string | null>(null);
const signed = computed(() => signatures.value[0]);

// The page of the form's signature field: the box goes next to the signature.
function signaturePage() {
  return form.getWidgets(toFieldRef('approval'))[0]?.page;
}

// The moment a change would break a signature once it's saved, as Acrobat warns.
useSignatureEvent(
  (plugin) => plugin.onInvalidationPredicted,
  ({ field }) => {
    const name = signature.getSignature(field)?.fieldName;
    warning.value = `This change will break the signature in "${name}" when saved.`;
  },
);

function drawBox() {
  const page = signaturePage();
  if (!page) return;
  void annotation.create(page, {
    subtype: 'square',
    box: { x: 320, y: 560, width: 140, height: 64 },
    color: '#e11d48',
    strokeWidth: 2,
  });
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!signed || !signaturePage()" @click="drawBox">
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
