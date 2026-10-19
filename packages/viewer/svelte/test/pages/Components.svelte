<!-- The viewer with a component of the app's in each of its places. -->
<script lang="ts">
  import {
    Button,
    Menu,
    MenuItem,
    PDFViewer,
    Panel,
    Region,
    ToolbarItem,
    type LayoutFunction,
  } from '@embedpdf/viewer-svelte';
  import type { ComponentsRecord } from './components';
  import Sized from './Sized.svelte';
  import Where from './Where.svelte';

  let { record }: { record: ComponentsRecord } = $props();

  let width = $state('100%');
  // The test drives the page through its record.
  $effect.pre(() => {
    record.setWidth = (next) => (width = next);
  });

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
</script>

<PDFViewer
  src="/sample.pdf"
  {layout}
  style="height: 100vh; width: {width}; display: block"
  onready={(viewer) => (record.viewer = viewer)}
>
  <Region name="header">
    <header data-check="header">Acme Contracts</header>
  </Region>
  <ToolbarItem id="where">
    <Where />
  </ToolbarItem>
  <ToolbarItem id="sized">
    <Sized />
  </ToolbarItem>
  <ToolbarItem id="zoom-in">
    <Button command="zoom:in" />
  </ToolbarItem>
  <ToolbarItem id="share">
    <Menu icon="link" label="Share">
      <MenuItem icon="copy" onselect={() => record.picked.push('copy')}>Copy link</MenuItem>
      <MenuItem icon="message" onselect={() => record.picked.push('email')}>Email a link</MenuItem>
    </Menu>
  </ToolbarItem>
  <Panel id="notes">
    <textarea data-check="notes" placeholder="Your notes"></textarea>
  </Panel>
  <Region name="footer">
    <footer data-check="footer">Saved a minute ago</footer>
  </Region>
</PDFViewer>
