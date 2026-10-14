<!-- Rotates the page you're on, in the file: the turn is kept when the document is downloaded. -->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStageState } from '@embedpdf/vue/stage';
import { usePageEdit } from '@embedpdf/vue/page-edit';

const pageEdit = usePageEdit();
const pages = usePageList();
const currentPageIndex = useStageState((state) => state.currentPageIndex);
const page = computed(() => pages.value[currentPageIndex.value]);
const canEdit = computed(() => pageEdit.canEdit());

// The first page starts a quarter turn clockwise. setRotation() sets the same rotation
// however often it runs; rotateBy() would turn it again.
onMounted(() => {
  void pageEdit.setRotation([0], 90);
});

function everyPageUpright() {
  void pageEdit.setRotation(
    pages.value.map((each) => each.ref),
    0,
  );
}
</script>

<template>
  <div v-if="page" class="toolbar">
    <output class="readout">Page {{ currentPageIndex + 1 }} · {{ page.rotation }}°</output>
    <span class="spacer" />
    <button
      type="button"
      class="button"
      :disabled="!canEdit"
      @click="pageEdit.rotateBy([page.ref], -90)"
    >
      ⟲ Rotate left
    </button>
    <button
      type="button"
      class="button"
      :disabled="!canEdit"
      @click="pageEdit.rotateBy([page.ref], 90)"
    >
      ⟳ Rotate right
    </button>
    <button type="button" class="button" :disabled="!canEdit" @click="everyPageUpright">
      Every page upright
    </button>
  </div>
</template>
