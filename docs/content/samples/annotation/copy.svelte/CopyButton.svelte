<!-- A read passed to create() makes the same annotation again, here on the next page. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const stage = useStage();
  const pages = usePageList();
  const selected = useAnnotationState((state) => state.selected);
  let status = $state('');
  const first = $derived(selected.current[0]);
  const index = $derived(
    first
      ? pages.current.findIndex((page) => page.ref.objectNumber === first.page.objectNumber)
      : -1,
  );
  const next = $derived(pages.current[index + 1]);

  async function copyToNextPage() {
    if (!first || !next) return;
    const target = next;
    const copy = annotation.get(first.ref)!;
    const { annotation: made } = await annotation.create(target.ref, copy, undefined, {
      select: true, // so the next click copies the copy, a page further
    });
    stage.reveal(target.ref, { rect: made.rect });
    status = `Copied to page ${target.index + 1}`;
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={selected.current.length !== 1 || !next}
    onclick={() => void copyToNextPage()}
  >
    Copy to the next page
  </button>
  <span class="spacer"></span>
  <output class="readout">
    {status || (first ? 'Ready to copy' : 'Select an annotation to copy')}
  </output>
</div>
