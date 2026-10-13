<script setup lang="ts">
import { shallowRef } from 'vue';
import {
  Button,
  Menu,
  MenuItem,
  PDFViewer,
  Panel,
  Region,
  ToolbarItem,
} from '@embedpdf/viewer-vue';
import type { LayoutFunction, Viewer } from '@embedpdf/viewer-vue';

import type { ComponentsRecord } from './components';
import ItemSized from './ItemSized.vue';
import ItemWhere from './ItemWhere.vue';

const { record } = defineProps<{ record: ComponentsRecord }>();

const width = shallowRef('100%');
record.setWidth = (next) => (width.value = next);

const layout: LayoutFunction = (base, env) => {
  const placed = base
    .add({ custom: 'where' }, { to: 'main', section: 'start' })
    .add(
      { custom: 'sized', variants: ['full', 'short'], command: 'zoom:in' },
      { to: 'main', section: 'start' },
    )
    .add({ custom: 'zoom-in' }, { to: 'main', section: 'start' })
    .add({ custom: 'share' }, { to: 'main', section: 'start' })
    .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
    .add('panel:notes', { to: 'main', section: 'end' });
  return env.width < 900 ? placed.place('main', 'start') : placed;
};

function onReady(viewer: Viewer) {
  record.viewer = viewer;
}
</script>

<template>
  <PDFViewer
    src="/sample.pdf"
    :layout="layout"
    :style="{ height: '100vh', width, display: 'block' }"
    @ready="onReady"
  >
    <Region name="header">
      <header data-check="header">Acme Contracts</header>
    </Region>
    <ToolbarItem id="where">
      <ItemWhere />
    </ToolbarItem>
    <ToolbarItem id="sized">
      <ItemSized />
    </ToolbarItem>
    <ToolbarItem id="zoom-in">
      <Button command="zoom:in" />
    </ToolbarItem>
    <ToolbarItem id="share">
      <Menu icon="link" label="Share">
        <MenuItem icon="copy" @select="record.picked.push('copy')">Copy link</MenuItem>
        <MenuItem icon="message" @select="record.picked.push('email')">Email a link</MenuItem>
      </Menu>
    </ToolbarItem>
    <Panel id="notes">
      <textarea data-check="notes" placeholder="Your notes" />
    </Panel>
    <Region name="footer">
      <footer data-check="footer">Saved a minute ago</footer>
    </Region>
  </PDFViewer>
</template>
