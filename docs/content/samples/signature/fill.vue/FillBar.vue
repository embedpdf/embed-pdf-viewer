<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { toFieldRef, useForm, useFormState } from '@embedpdf/vue/form';
import { useStamp } from '@embedpdf/vue/stamp';
import { useSignature, useSignatureEvent } from '@embedpdf/vue/signature';

const APPROVAL = toFieldRef('approval');

const form = useForm();
const stamp = useStamp();
const stage = useStage();
const signature = useSignature();
const status = useFormState((state) => state.status);
const pages = usePageList();
const lastPage = computed(() => pages.value.at(-1)?.ref);
const assetId = ref<string | null>(null);
const drawn = ref(false);

useSignatureEvent(
  (plugin) => plugin.onFilled,
  () => (drawn.value = true),
);
useSignatureEvent(
  (plugin) => plugin.onCleared,
  () => (drawn.value = false),
);

// On load: a signature field on the last page, a typed signature, drawn into the field.
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
      assetId.value = asset.id;
      await signature.fillField(APPROVAL, { assetId: asset.id });
    })();
  },
  { immediate: true },
);

function drawIn() {
  if (assetId.value) void signature.fillField(APPROVAL, { assetId: assetId.value });
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!assetId || drawn" @click="drawIn">
      Draw it in
    </button>
    <button
      type="button"
      class="button"
      :disabled="!drawn"
      @click="signature.clearField(APPROVAL)"
    >
      Take it out
    </button>
    <output class="readout">
      {{ drawn ? 'Drawn in, not signed: no key sealed anything' : 'The field is empty' }}
    </output>
  </div>
</template>
