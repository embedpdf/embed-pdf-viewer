<!-- Create a rectangle, then change, move and delete it, all from code. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useAnnotation, type AnnotationRef } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const stage = useStage();
  const pages = usePageList();
  const page = $derived(pages.current[4]?.ref); // the document's empty last page
  let ref = $state.raw<AnnotationRef | null>(null);

  // Reads named get…, can… and is… follow the annotations as they change.
  const square = $derived(ref ? annotation.get(ref) : null);
  const canUpdate = $derived(square !== null && annotation.canUpdate(square.ref));
  const canDelete = $derived(square !== null && annotation.canDelete(square.ref));
  const status = $derived.by(() => {
    if (!square) return 'No rectangle';
    return annotation.isPending(square.ref) ? 'Saving…' : 'Saved';
  });

  async function add() {
    if (!page) return;
    const { annotation: made } = await annotation.create(page, {
      subtype: 'square',
      box: { x: 72, y: 592, width: 200, height: 100 },
      color: '#0078ff',
      strokeWidth: 3,
    });
    ref = made.ref;
    stage.reveal(page, { rect: made.rect });
  }

  function makeRed() {
    if (square) void annotation.update(square.ref, { color: '#dc143c' });
  }

  function moveRight() {
    if (!square) return;
    const { rect } = square;
    void annotation.update(square.ref, { rect: { ...rect, x: rect.x + 40 } }); // 40 points right
  }

  function turn() {
    if (square) void annotation.update(square.ref, { rotation: 90 });
  }

  function remove() {
    if (!square) return;
    void annotation.delete(square.ref);
    ref = null;
  }
</script>

<div class="toolbar">
  <button type="button" class="button" disabled={square !== null} onclick={add}>Create</button>
  <button type="button" class="button" disabled={!canUpdate} onclick={makeRed}>Make it red</button>
  <button type="button" class="button" disabled={!canUpdate} onclick={moveRight}>Move right</button>
  <button type="button" class="button" disabled={!canUpdate} onclick={turn}>Turn to 90°</button>
  <button type="button" class="button" disabled={!canDelete} onclick={remove}>Delete</button>
  <span class="spacer"></span>
  <output class="readout">{status}</output>
</div>
