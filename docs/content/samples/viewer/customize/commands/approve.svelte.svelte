<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';
  import './approve.css';

  // [!doc-source welcome]
  const welcome = '/pdfs/welcome.pdf';
  // [!/doc-source]

  let status = $state('Waiting for approval');

  const config: ViewerConfig = {
    commands: [
      {
        id: 'acme:approve',
        label: 'Approve',
        icon: 'check',
        shortcut: 'Mod+Enter',
        run: () => {
          status = `Approved at ${new Date().toLocaleTimeString()}`;
        },
      },
    ],
    layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
  };
</script>

<div class="app" style="height: 100%">
  <p class="status">
    Status: <strong>{status}</strong>
  </p>
  <PDFViewer src={welcome} {...config} class="viewer" />
</div>
