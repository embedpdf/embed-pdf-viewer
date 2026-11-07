<script setup lang="ts">
import { computed, watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import { useStamp, useStampState } from '@embedpdf/vue/stamp';
import { useSignatureState, useSignerRows } from '@embedpdf/vue/signature';

/** On load: the agreement, where the form's signature field is, and a person's signature, armed. */
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
        const { asset } = await stamp.createAsset({
          libraryId: library.id,
          name: 'signature',
          label: 'Signature',
          mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
        });
        await stamp.armAsset(asset.id, { targetWidth: 160 });
      })();
    },
    { immediate: true },
  );
}

useSetUp();
const stamp = useStamp();
const rows = useSignerRows();
const { armedAsset } = useStampState();
const { signatures } = useSignatureState();
const mark = computed(() => rows.value[0]?.signatures[0]);

const hint = computed(() => {
  // Ada's signature, once she signs: the agreement already carries Lanternfield's.
  const signed = signatures.value.find((each) => each.fieldName === 'approval');
  if (signed) return `The field is signed by ${signed.signer.name}`;
  if (armedAsset.value) return 'Click the empty field to sign it, or anywhere else to place it';
  if (mark.value) return 'Arm the signature, then click where it goes';
  return 'Getting ready…';
});

function toggle() {
  if (armedAsset.value) stamp.disarm();
  else if (mark.value) void stamp.armAsset(mark.value.id);
}
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="!mark"
      :aria-pressed="armedAsset !== null"
      @click="toggle"
    >
      {{ armedAsset ? 'Disarm' : 'Arm the signature' }}
    </button>
    <output class="readout">{{ hint }}</output>
  </div>
</template>
