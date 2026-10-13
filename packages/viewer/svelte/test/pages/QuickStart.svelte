<!-- Quick start's config, and your own component in the toolbar, after a control of the app's. -->
<script lang="ts">
  import { PDFViewer, ToolbarItem, type Layout, type ViewerConfig } from '@embedpdf/viewer-svelte';
  import DocumentStatus from './DocumentStatus.svelte';
  import type { QuickStartRecord } from './quick-start';

  let { record }: { record: QuickStartRecord } = $props();

  /** Quick start's `viewer-config.js`, its command saying it ran in place of the request. */
  const config = {
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
        run: ({ documentId }) => {
          record.sent.push(documentId);
        },
      },
    ],
    layout: (layout: Layout) => layout.add('acme:send', { to: 'main', section: 'end' }),
  } satisfies ViewerConfig;

  /** Step 4: room for your component, after the config's own layout. */
  const layout = (base: Layout) =>
    config.layout(base).add({ custom: 'status' }, { to: 'main', section: 'end' });
</script>

<button data-check="before">Before the viewer</button>
<PDFViewer
  src="/sample.pdf"
  {...config}
  {layout}
  style="height: 100vh; display: block"
  onready={(viewer) => (record.viewer = viewer)}
>
  <ToolbarItem id="status">
    <DocumentStatus status="Draft" />
  </ToolbarItem>
</PDFViewer>
