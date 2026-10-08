<script lang="ts">
  import { PDFViewer, ToolbarItem } from '@embedpdf/viewer-svelte';
  import { versions } from './versions.svelte'; // your app

  const layout = (layout) =>
    layout.add({ custom: 'versions', command: 'acme:versions' }, { to: 'main', section: 'start' });
</script>

<PDFViewer src={versions.currentUrl} {layout} style="height: 100vh">
  <ToolbarItem id="versions">
    <select class="versions" bind:value={versions.current}>
      {#each versions.list as version (version.id)}
        <option value={version.id}>{version.label}</option>
      {/each}
    </select>
  </ToolbarItem>
</PDFViewer>
