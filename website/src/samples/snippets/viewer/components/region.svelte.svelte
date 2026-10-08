<script lang="ts">
  import { PDFViewer, Region } from '@embedpdf/viewer-svelte';
  import AppHeader from './AppHeader.svelte'; // your app
  import RecentFiles from './RecentFiles.svelte';
</script>

<PDFViewer style="height: 100vh">
  <Region name="header"><AppHeader /></Region>
  <Region name="empty"><RecentFiles /></Region>
</PDFViewer>
