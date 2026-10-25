<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-svelte';

  const welcome = { shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

  const config: ViewerConfig = {
    theme: { accent: '#7c3aed' },
    disable: ['forms', 'redaction'],
    icons: {
      send: ['M10 14L21 3', 'M21 3l-6.5 18a.5.5 0 0 1-1 0L10 14l-7-3.5a.5.5 0 0 1 0-1L21 3z'],
    },
    commands: [
      {
        id: 'acme:send',
        label: 'Send for signature',
        icon: 'send',
        run: () => alert('Sent for signature'),
      },
    ],
    layout: (layout) => layout.add('acme:send', { to: 'main', section: 'end' }),
  };
</script>

<PDFViewer src={welcome} {...config} style="height: 100%" />
