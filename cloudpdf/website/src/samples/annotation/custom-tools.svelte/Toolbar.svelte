<!-- A toolbar that builds itself from the tools: every tool with a label gets a button. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useInteraction, useInteractionState } from '@embedpdf/svelte/interaction';
  import { useAnnotation, useAnnotationState } from '@embedpdf/svelte/annotation';

  const annotation = useAnnotation();
  const interaction = useInteraction();
  const tools = useInteractionState();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const pages = usePageList();
  const labelled = $derived(
    annotation.tools.list().filter((tool) => typeof tool.meta?.label === 'string'),
  );
  let added = false;

  // On load: an arrow drawn with the arrow tool's defaults, and the arrow tool active.
  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (!ready.current || !cover || added) return;
    added = true;
    void annotation.create(
      cover,
      { subtype: 'line', linePoints: { start: { x: 520, y: 120 }, end: { x: 470, y: 230 } } },
      undefined,
      { tool: 'arrow' },
    );
    interaction.activateTool('arrow');
  });
</script>

<div class="toolbar">
  <div class="segmented" role="group" aria-label="Tool">
    <button
      type="button"
      aria-pressed={tools.activeToolId === 'pointer'}
      onclick={() => interaction.activateTool('pointer')}
    >
      Select
    </button>
    {#each labelled as tool (tool.id)}
      <button
        type="button"
        aria-pressed={tools.activeToolId === tool.id}
        onclick={() => interaction.activateTool(tool.id)}
      >
        {String(tool.meta?.label)}
      </button>
    {/each}
  </div>
</div>
