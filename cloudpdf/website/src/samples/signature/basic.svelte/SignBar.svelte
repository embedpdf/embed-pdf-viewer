<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage } from '@embedpdf/svelte/stage';
  import { toFieldRef, useForm, useFormState } from '@embedpdf/svelte/form';
  import { useStamp } from '@embedpdf/svelte/stamp';
  import { useSignature, useSignatureState, useSignerRows } from '@embedpdf/svelte/signature';
  import MarkButton from './MarkButton.svelte';

  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const signature = useSignature();
  const signatureState = useSignatureState();
  const rows = useSignerRows();
  const status = useFormState((formState) => formState.status);
  const field = useFormState((formState) =>
    formState.fields.find((candidate) => candidate.family === 'signature'),
  );
  const person = $derived(rows.current[0]);
  const signed = $derived(signatureState.signatures[0]);
  let error = $state<string | null>(null);

  // Start at the agreement's signature field. The browser holds no signatures
  // yet: add one person with a typed signature.
  let done = false;
  $effect(() => {
    if (status.current !== 'ready' || done) return;
    done = true;
    untrack(async () => {
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
    });
  });

  // The target is the field someone clicked; without one, the form's signature field.
  function sign(assetId: string) {
    const destination = signatureState.target ?? field.current?.ref;
    if (!destination) return;
    error = null;
    signature
      .placeMark({ assetId }, { field: destination })
      .catch((reason: Error) => (error = reason.message));
  }

  const readout = $derived.by(() => {
    if (!person || !field.current) return 'Getting ready…';
    if (error) return error;
    if (signatureState.busy) return 'Signing…';
    if (signed) return `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`;
    if (signatureState.target) return 'Now pick the signature';
    return 'Click the field, or pick the signature';
  });
</script>

<div class="toolbar">
  {#each person?.signatures ?? [] as asset (asset.id)}
    <MarkButton assetId={asset.id} label={asset.label} onPick={() => sign(asset.id)} />
  {/each}
  <output class="readout">{readout}</output>
</div>
