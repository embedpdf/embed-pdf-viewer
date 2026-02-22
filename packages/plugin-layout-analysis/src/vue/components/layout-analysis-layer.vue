<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
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
}

const props = defineProps<LayoutAnalysisLayerProps>();

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
const TABLE_STRUCTURE_BORDER_COLOR = 'rgba(234, 88, 12, 0.5)';

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

const { provides: layoutAnalysis } = useLayoutAnalysisCapability();
const documentState = useDocumentState(() => props.documentId);

const layout = ref<PageLayout | null>(null);
const pluginState = ref<LayoutAnalysisState | null>(null);

const scope = computed(() =>
  layoutAnalysis.value ? layoutAnalysis.value.forDocument(props.documentId) : null,
);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  [scope, () => props.pageIndex],
  ([currentScope, page], _, onCleanup) => {
    if (!currentScope) {
      layout.value = null;
      pluginState.value = null;
      return;
    }

    layout.value = currentScope.getPageLayout(page);
    pluginState.value = currentScope.getState();

    const unsub1 = currentScope.onPageLayoutChange((event) => {
      if (event.pageIndex === page) {
        layout.value = event.layout;
      }
    });

    const unsub2 = currentScope.onStateChange((state) => {
      pluginState.value = state;
    });

    onCleanup(() => {
      unsub1();
      unsub2();
    });
  },
  { immediate: true },
);

const layoutOverlayVisible = computed(() => pluginState.value?.layoutOverlayVisible ?? true);
const tableStructureOverlayVisible = computed(
  () => pluginState.value?.tableStructureOverlayVisible ?? true,
);
const layoutThreshold = computed(() => pluginState.value?.layoutThreshold ?? 0.35);
const tableStructureThreshold = computed(() => pluginState.value?.tableStructureThreshold ?? 0.8);
const selectedBlockId = computed(() => pluginState.value?.selectedBlockId ?? null);

const filteredBlocks = computed(() => {
  if (!layout.value || !layoutOverlayVisible.value) return [];
  return layout.value.blocks.filter((block) => block.score >= layoutThreshold.value);
});

const tableStructureEntries = computed(() => {
  if (!layout.value || !tableStructureOverlayVisible.value || !layout.value.tableStructures)
    return [];
  return Array.from(layout.value.tableStructures.entries())
    .filter(([blockId]) => {
      const parent = layout.value!.blocks.find((b) => b.id === blockId);
      return parent && parent.score >= layoutThreshold.value;
    })
    .flatMap(([blockId, elements]) =>
      elements
        .filter((el) => el.score >= tableStructureThreshold.value)
        .map((el, idx) => ({ key: `ts-${blockId}-${idx}`, element: el })),
    );
});

const visible = computed(
  () => layout.value && (layoutOverlayVisible.value || tableStructureOverlayVisible.value),
);

function handleBlockClick(blockId: string) {
  layoutAnalysis.value?.selectBlock(selectedBlockId.value === blockId ? null : blockId);
}

function blockStyle(block: LayoutBlock): Record<string, string> {
  const s = actualScale.value;
  const isSelected = selectedBlockId.value === block.id;
  return {
    position: 'absolute',
    left: `${block.rect.origin.x * s}px`,
    top: `${block.rect.origin.y * s}px`,
    width: `${block.rect.size.width * s}px`,
    height: `${block.rect.size.height * s}px`,
    backgroundColor: getColorForLabel(block.label),
    border: `1.5px solid ${getBorderColorForLabel(block.label)}`,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    cursor: 'pointer',
    opacity: isSelected ? '1' : '0.8',
    outline: isSelected ? '2px solid #3b82f6' : 'none',
    transition: 'opacity 0.15s',
  };
}

function labelStyle(block: LayoutBlock): Record<string, string> {
  return {
    position: 'absolute',
    top: '-18px',
    left: '0',
    fontSize: '10px',
    lineHeight: '16px',
    padding: '0 4px',
    backgroundColor: getBorderColorForLabel(block.label),
    color: '#fff',
    borderRadius: '2px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
}

function tableElementStyle(element: TableStructureElement): Record<string, string> {
  const s = actualScale.value;
  return {
    position: 'absolute',
    left: `${element.rect.origin.x * s}px`,
    top: `${element.rect.origin.y * s}px`,
    width: `${element.rect.size.width * s}px`,
    height: `${element.rect.size.height * s}px`,
    backgroundColor: TABLE_STRUCTURE_COLOR,
    border: `1px dashed ${TABLE_STRUCTURE_BORDER_COLOR}`,
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };
}
</script>

<template>
  <div
    v-if="visible"
    :style="{ pointerEvents: 'none' }"
    data-layout-analysis-layer=""
    v-bind="$attrs"
  >
    <div
      v-for="block in filteredBlocks"
      :key="block.id"
      :style="blockStyle(block)"
      :data-block-id="block.id"
      :data-block-label="block.label"
      @click="handleBlockClick(block.id)"
    >
      <span :style="labelStyle(block)">
        {{ block.label }} {{ (block.score * 100).toFixed(0) }}%
      </span>
    </div>

    <div
      v-for="{ key, element } in tableStructureEntries"
      :key="key"
      :style="tableElementStyle(element)"
      :data-table-element="element.label"
    />
  </div>
</template>
