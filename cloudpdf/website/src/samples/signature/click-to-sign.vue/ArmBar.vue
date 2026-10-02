<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useForm, useFormState } from '@embedpdf/vue/form';
import { useStamp, useStampState } from '@embedpdf/vue/stamp';
import { useSignatureState, useSignerRows } from '@embedpdf/vue/signature';

/** On load: a signature field on the last page, and a person's signature, armed. */
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
  if (signatures.value[0]) return `The field is signed by ${signatures.value[0].signer.name}`;
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
