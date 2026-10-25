<script lang="ts">
  import { untrack } from 'svelte';
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

  // On load: Ada's typed signature, ready to draw in, and the signature field in view.
  let done = false;
  $effect(() => {
    if (status.current !== 'ready' || done) return;
    done = true;
    untrack(async () => {
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
      assetId = asset.id;
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
