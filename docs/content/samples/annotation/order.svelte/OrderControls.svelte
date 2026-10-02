<!-- The last annotation on a page is drawn on top. -->
<script lang="ts">
  import {
    annotationKey,
    useAnnotation,
    useAnnotationList,
    useAnnotationState,
  } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const selected = useAnnotationState((state) => state.selected);
  const first = $derived(selected.current[0]);
  const onPage = useAnnotationList(() => (first ? { pages: [first.page] } : undefined));
  const position = $derived(
    first
      ? onPage.current.findIndex((a) => annotationKey(a.ref) === annotationKey(first.ref))
      : -1,
  );

  function sendToBack() {
    if (first) void annotation.move([first.ref], 0);
  }

  function bringToFront() {
    if (first) void annotation.move([first.ref], onPage.current.length - 1);
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!first || selected.current.length !== 1}
    onclick={sendToBack}
  >
    Send to back
  </button>
  <button
    type="button"
    class="button"
    disabled={!first || selected.current.length !== 1}
    onclick={bringToFront}
  >
    Bring to front
  </button>
  <span class="spacer"></span>
  <output class="readout">
    {position >= 0 ? `${position + 1} of ${onPage.current.length}, from the back` : 'Select a rectangle'}
  </output>
</div>
