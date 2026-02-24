<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import type { Tile } from '@embedpdf/plugin-tiling';

import { useTilingCapability } from '../hooks';
import TileImg from './tile-img.vue';

interface TilingLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
}

const props = defineProps<TilingLayerProps>();

const { provides: tilingProvides } = useTilingCapability();
const documentState = useDocumentState(() => props.documentId);
const tiles = ref<Tile[]>([]);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  [tilingProvides, () => props.documentId, () => props.pageIndex],
  ([provides, docId, pageIdx], _, onCleanup) => {
    if (!provides) {
      tiles.value = [];
      return;
    }

    const unsubscribe = provides.onTileRendering((event) => {
      if (event.documentId === docId) {
        tiles.value = event.tiles[pageIdx] ?? [];
      }
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);
</script>

<template>
  <div v-bind="$attrs">
    <TileImg
      v-for="tile in tiles"
      :key="tile.id"
      :documentId="documentId"
      :pageIndex="pageIndex"
      :tile="tile"
      :scale="actualScale"
    />
  </div>
</template>
