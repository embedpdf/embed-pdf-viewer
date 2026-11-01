<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import { useStamp } from '@embedpdf/vue/stamp';
import { useSignature, useSignatureState, useSignerRows } from '@embedpdf/vue/signature';
import MarkButton from './MarkButton.vue';

/**
 * Start at the agreement's signature field. The browser holds no signatures
 * yet: add one person with a typed signature.
 */
function useSetUp() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
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
// Ada's signature, once she signs: the agreement already carries Lanternfield's.
const signed = computed(() => signatures.value.find((each) => each.fieldName === 'approval'));

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
