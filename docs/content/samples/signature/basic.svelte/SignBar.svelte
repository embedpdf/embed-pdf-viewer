<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useForm, useFormState } from '@embedpdf/svelte/form';
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
  const pages = usePageList();
  const person = $derived(rows.current[0]);
  const signed = $derived(signatureState.signatures[0]);
  let error = $state<string | null>(null);

  // The ebook has no signature field, and the browser holds no signatures yet:
  // add a field to the last page, and one person with a typed signature.
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
