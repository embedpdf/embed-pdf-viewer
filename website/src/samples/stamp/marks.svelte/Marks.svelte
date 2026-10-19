<script lang="ts">
  import { onMount } from 'svelte';
  import {
    useStamp,
    useStampAssets,
    useStampLibraries,
    useStampState,
  } from '@embedpdf/svelte/stamp';
  import MarkButton from './MarkButton.svelte';

  // A signature as a pen would draw it: two strokes, in points.
  const loop = Array.from({ length: 48 }, (_, i) => ({
    x: i * 4,
    y: 30 - Math.sin(i / 3) * 16 - i * 0.2,
  }));
  const underline = [
    { x: 10, y: 52 },
    { x: 180, y: 46 },
  ];

  const stamp = useStamp();
  const libraries = useStampLibraries();
  const library = $derived(libraries.current[0]);
  const marks = useStampAssets(() => ({ libraryId: library?.id }));
  const armedAsset = useStampState((state) => state.armedAsset);
  let text = $state('Ada L.');

  // On load: a drawn signature and typed initials, in a library of their own.
  onMount(() => {
    void stamp.createLibrary('Ada Lovelace').then(async ({ library: created }) => {
      await stamp.createAsset({
        libraryId: created.id,
        label: 'Signature',
        mark: { kind: 'ink', strokes: [loop, underline], strokeWidth: 2.5, color: '#1d2b53' },
      });
      await stamp.createAsset({
        libraryId: created.id,
        label: 'Initials',
        mark: { kind: 'text', text: 'AL', fontFamily: 'times-italic', color: '#1d2b53' },
      });
    });
  });

  async function typeMark() {
    if (!library || !text.trim()) return;
    const { asset } = await stamp.createAsset({
      libraryId: library.id,
      label: text.trim(),
      mark: { kind: 'text', text: text.trim(), fontFamily: 'times-italic', color: '#1d2b53' },
    });
    await stamp.armAsset(asset.id);
  }

  function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    void typeMark();
  }
</script>

<div class="toolbar">
  {#each marks.current as asset (asset.id)}
    <MarkButton {asset} armed={armedAsset.current?.id === asset.id} />
  {/each}
  <span class="spacer"></span>
  <form class="type" {onsubmit}>
    <input class="field" aria-label="Text of a typed stamp" bind:value={text} />
    <button type="submit" class="button" disabled={!library || !text.trim()}>
      Type a stamp
    </button>
  </form>
</div>
