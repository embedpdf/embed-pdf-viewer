<script lang="ts">
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useLayoutAnalysisCapability } from '../hooks';
  import type {
    PageLayout,
    LayoutAnalysisState,
    LayoutBlock,
    TableStructureElement,
  } from '@embedpdf/plugin-layout-analysis';

  interface LayoutAnalysisLayerProps {
    documentId: string;
    pageIndex: number;
    scale?: number;
    class?: string;
    style?: string;
  }

  const {
    documentId,
    pageIndex,
    scale: scaleOverride,
    class: propsClass,
    style: propsStyle,
  }: LayoutAnalysisLayerProps = $props();

  const CLASS_COLORS: Record<string, string> = {
    text: 'rgba(59, 130, 246, 0.15)',
    table: 'rgba(16, 185, 129, 0.15)',
    image: 'rgba(245, 158, 11, 0.15)',
    doc_title: 'rgba(139, 92, 246, 0.15)',
    header: 'rgba(236, 72, 153, 0.15)',
    footer: 'rgba(107, 114, 128, 0.15)',
    formula: 'rgba(6, 182, 212, 0.15)',
    chart: 'rgba(249, 115, 22, 0.15)',
    abstract: 'rgba(168, 85, 247, 0.15)',
    paragraph_title: 'rgba(99, 102, 241, 0.15)',
    reference: 'rgba(75, 85, 99, 0.15)',
  };

  const CLASS_BORDER_COLORS: Record<string, string> = {
    text: 'rgba(59, 130, 246, 0.7)',
    table: 'rgba(16, 185, 129, 0.7)',
    image: 'rgba(245, 158, 11, 0.7)',
    doc_title: 'rgba(139, 92, 246, 0.7)',
    header: 'rgba(236, 72, 153, 0.7)',
    footer: 'rgba(107, 114, 128, 0.7)',
    formula: 'rgba(6, 182, 212, 0.7)',
    chart: 'rgba(249, 115, 22, 0.7)',
    abstract: 'rgba(168, 85, 247, 0.7)',
    paragraph_title: 'rgba(99, 102, 241, 0.7)',
    reference: 'rgba(75, 85, 99, 0.7)',
  };

  const TABLE_STRUCTURE_COLOR = 'rgba(234, 88, 12, 0.12)';
  const TABLE_STRUCTURE_BORDER = 'rgba(234, 88, 12, 0.5)';

  function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function getColorForLabel(label: string): string {
    return CLASS_COLORS[label] ?? `hsla(${hashCode(label) % 360}, 70%, 50%, 0.15)`;
  }

  function getBorderColorForLabel(label: string): string {
    return CLASS_BORDER_COLORS[label] ?? `hsla(${hashCode(label) % 360}, 70%, 50%, 0.7)`;
  }

  const layoutAnalysisCapability = useLayoutAnalysisCapability();
  const documentState = useDocumentState(() => documentId);

  let layout = $state<PageLayout | null>(null);
  let pluginState = $state<LayoutAnalysisState | null>(null);

  const scope = $derived(
    layoutAnalysisCapability.provides
      ? layoutAnalysisCapability.provides.forDocument(documentId)
      : null,
  );

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    const currentScope = scope;
    const page = pageIndex;

    if (!currentScope) {
      layout = null;
      pluginState = null;
      return;
    }

    layout = currentScope.getPageLayout(page);
    pluginState = currentScope.getState();

    const unsub1 = currentScope.onPageLayoutChange((event) => {
      if (event.pageIndex === page) {
        layout = event.layout;
      }
    });

    const unsub2 = currentScope.onStateChange((state) => {
      pluginState = state;
    });

    return () => {
      unsub1();
      unsub2();
    };
  });

  const layoutOverlayVisible = $derived(pluginState?.layoutOverlayVisible ?? true);
  const tableStructureOverlayVisible = $derived(pluginState?.tableStructureOverlayVisible ?? true);
  const layoutThreshold = $derived(pluginState?.layoutThreshold ?? 0.35);
  const tableStructureThreshold = $derived(pluginState?.tableStructureThreshold ?? 0.8);
  const selectedBlockId = $derived(pluginState?.selectedBlockId ?? null);

  const filteredBlocks = $derived.by(() => {
    if (!layout || !layoutOverlayVisible) return [];
    return layout.blocks.filter((block) => block.score >= layoutThreshold);
  });

  const tableStructureEntries = $derived.by(() => {
    if (!layout || !tableStructureOverlayVisible || !layout.tableStructures) return [];
    return Array.from(layout.tableStructures.entries())
      .filter(([blockId]) => {
        const parent = layout!.blocks.find((b) => b.id === blockId);
        return parent && parent.score >= layoutThreshold;
      })
      .flatMap(([blockId, elements]) =>
        elements
          .filter((el) => el.score >= tableStructureThreshold)
          .map((el, idx) => ({ key: `ts-${blockId}-${idx}`, element: el })),
      );
  });

  const visible = $derived(layout && (layoutOverlayVisible || tableStructureOverlayVisible));

  function handleBlockClick(blockId: string) {
    layoutAnalysisCapability.provides?.selectBlock(selectedBlockId === blockId ? null : blockId);
  }
</script>

{#if visible}
  <div
    style={`pointer-events: none; ${propsStyle ?? ''}`}
    class={propsClass}
    data-layout-analysis-layer=""
  >
    {#each filteredBlocks as block (block.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        style={`position: absolute; left: ${block.rect.origin.x * actualScale}px; top: ${block.rect.origin.y * actualScale}px; width: ${block.rect.size.width * actualScale}px; height: ${block.rect.size.height * actualScale}px; background-color: ${getColorForLabel(block.label)}; border: 1.5px solid ${getBorderColorForLabel(block.label)}; box-sizing: border-box; pointer-events: auto; cursor: pointer; opacity: ${selectedBlockId === block.id ? 1 : 0.8}; ${selectedBlockId === block.id ? 'outline: 2px solid #3b82f6;' : ''} transition: opacity 0.15s;`}
        data-block-id={block.id}
        data-block-label={block.label}
        onclick={() => handleBlockClick(block.id)}
      >
        <span
          style={`position: absolute; top: -18px; left: 0; font-size: 10px; line-height: 16px; padding: 0 4px; background-color: ${getBorderColorForLabel(block.label)}; color: #fff; border-radius: 2px; white-space: nowrap; pointer-events: none;`}
        >
          {block.label}
          {(block.score * 100).toFixed(0)}%
        </span>
      </div>
    {/each}

    {#each tableStructureEntries as { key, element } (key)}
      <div
        style={`position: absolute; left: ${element.rect.origin.x * actualScale}px; top: ${element.rect.origin.y * actualScale}px; width: ${element.rect.size.width * actualScale}px; height: ${element.rect.size.height * actualScale}px; background-color: ${TABLE_STRUCTURE_COLOR}; border: 1px dashed ${TABLE_STRUCTURE_BORDER}; box-sizing: border-box; pointer-events: none;`}
        data-table-element={element.label}
      ></div>
    {/each}
  </div>
{/if}
