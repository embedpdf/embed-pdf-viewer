<script setup lang="ts">
import { ref, watch } from 'vue';
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

// On load: the agreement, with a typed signature drawn into its signature field.
let done = false;
watch(
  status,
  (current) => {
    if (current !== 'ready' || done) return;
    done = true;
    void (async () => {
      // Bring the agreement's signature field into view.
      const [widget] = form.getWidgets(APPROVAL);
      if (widget) stage.reveal(widget.page, { rect: widget.rect });
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
