<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { toFieldRef, useForm, useFormState } from '@embedpdf/svelte/form';
  import { useStamp } from '@embedpdf/svelte/stamp';
  import { useSignature, useSignatureEvent } from '@embedpdf/svelte/signature';

  const APPROVAL = toFieldRef('approval');

  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const signature = useSignature();
  const status = useFormState((formState) => formState.status);
  const pages = usePageList();
  let assetId = $state<string | null>(null);
  let drawn = $state(false);

  useSignatureEvent(
    (plugin) => plugin.onFilled,
    () => (drawn = true),
  );
  useSignatureEvent(
    (plugin) => plugin.onCleared,
    () => (drawn = false),
  );

  // On load: a signature field on the last page, a typed signature, drawn into the field.
  let done = false;
  $effect(() => {
    const page = pages.current.at(-1)?.ref;
    if (status.current !== 'ready' || !page || done) return;
    done = true;
    untrack(async () => {
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
      assetId = asset.id;
      await signature.fillField(APPROVAL, { assetId: asset.id });
    });
  });

  function drawIn() {
    if (assetId) void signature.fillField(APPROVAL, { assetId });
  }
</script>

<div class="toolbar">
  <button type="button" class="button" disabled={!assetId || drawn} onclick={drawIn}>
    Draw it in
  </button>
  <button
    type="button"
    class="button"
    disabled={!drawn}
    onclick={() => void signature.clearField(APPROVAL)}
  >
    Take it out
  </button>
  <output class="readout">
    {drawn ? 'Drawn in, not signed: no key sealed anything' : 'The field is empty'}
  </output>
</div>
