<!-- The first page's links, read from the plugin, each with a button that follows it. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useLink, useLinkEvent } from '@embedpdf/vue/link';

const props = defineProps<{ ready: boolean }>();

const link = useLink();
const last = ref<string | null>(null);

// Every way of following a link ends up here: a click, a key, or code.
useLinkEvent(
  (link) => link.onActivated,
  ({ target, activation }) => (last.value = `${target.kind} → ${activation.outcome}`),
);

const links = computed(() => (props.ready ? link.listLinks(0) : []));
</script>

<template>
  <aside class="panel">
    <h3 class="heading">Links on page 1</h3>
    <ul class="links">
      <li v-for="item in links" :key="item.id" class="link">
        <span class="kind">{{ item.target.kind }}</span>
        <span class="label">{{ link.getLabel(item) }}</span>
        <span class="where">at {{ Math.round(item.bounds.x) }}, {{ Math.round(item.bounds.y) }}</span>
        <button type="button" class="button" @click="link.activate(item)">Follow</button>
      </li>
    </ul>
    <p class="last"><code>onActivated</code> {{ last ?? 'not yet' }}</p>
  </aside>
</template>
