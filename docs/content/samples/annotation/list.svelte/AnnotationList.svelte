<!-- The annotations of one kind, in drawing order. A click shows one on its page. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import {
    annotationKey,
    useAnnotation,
    useAnnotationList,
    type Annotation,
    type AnnotationSubtype,
  } from '@embedpdf/svelte/annotation';

  const KINDS: { label: string; subtype?: AnnotationSubtype }[] = [
    { label: 'All' },
    { label: 'Highlights', subtype: 'highlight' },
    { label: 'Notes', subtype: 'text' },
    { label: 'Rectangles', subtype: 'square' },
  ];

  let kind = $state.raw(KINDS[0]!);
  const ofKind = useAnnotationList(() => (kind.subtype ? { subtype: kind.subtype } : undefined));
  // Replies and review states belong to their comment's thread: the list leaves them out.
  const annotations = $derived(ofKind.current.filter((each) => each.reply?.type !== 'reply'));
  const pages = usePageList();
  const stage = useStage();
  const annotation = useAnnotation();

  const pageNumberOf = (objectNumber: number) =>
    pages.current.findIndex((page) => page.ref.objectNumber === objectNumber) + 1;

  function show(each: Annotation) {
    stage.reveal(each.page, { rect: each.rect });
    annotation.selection.set([each.ref]);
  }
</script>

<div class="panel">
  <div class="segmented" role="group" aria-label="Kind">
    {#each KINDS as each (each.label)}
      <button type="button" aria-pressed={each === kind} onclick={() => (kind = each)}>
        {each.label}
      </button>
    {/each}
  </div>
  <p class="count">{annotations.length} found</p>
  <ul class="items">
    {#each annotations as each (annotationKey(each.ref))}
      <li>
        <button type="button" class="item" onclick={() => show(each)}>
          <span class="kind">
            {each.subtype} · page {pageNumberOf(each.page.objectNumber)}
          </span>
          <span>{each.contents ?? '—'}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>
