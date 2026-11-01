<script lang="ts">
  import { Button, PDFViewer, ToolbarItem, type ViewerConfig } from '@embedpdf/viewer-svelte';

  const article = '/pdfs/article.pdf';

  // Paper by day and a warm dark at night, with a book's serif for the viewer's own words.
  const paper = {
    accent: '#a0522d',
    background: '#efe7d6',
    surface: '#f8f2e4',
    'surface-raised': '#fbf7ee',
    text: '#3b2f23',
    'text-muted': '#857461',
    border: '#e0d3bb',
    hover: '#efe5d1',
    canvas: '#ebe2ce',
    radius: '10px',
    font: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  };
  const night = {
    accent: '#d9a46c',
    background: '#15120e',
    surface: '#1e1a15',
    'surface-raised': '#27211b',
    text: '#ece2d0',
    'text-muted': '#a39582',
    border: '#3b332a',
    hover: '#302820',
    canvas: '#110e0b',
  };

  const config: ViewerConfig = {
    // Nothing changes the document; searching and copying still work.
    readOnly: true,
    icons: {
      contents: ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'],
      pages: [
        'M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
        'M15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
        'M5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
        'M15 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
      ],
      moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
      sun: [
        'M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0z',
        'M12 2v2',
        'M12 20v2',
        'm4.93 4.93 1.41 1.41',
        'm17.66 17.66 1.41 1.41',
        'M2 12h2',
        'M20 12h2',
        'm6.34 17.66-1.41 1.41',
        'm19.07 4.93-1.41 1.41',
      ],
    },
    // The whole layout: one pill floating over the pages, and Copy over selected text.
    layout: {
      bars: {
        reader: {
          place: { float: 'bottom' },
          center: [
            ['panel:outline', 'panel:thumbnails'],
            { items: ['page:previous', { custom: 'page-number' }, 'page:next'], importance: 5 },
            {
              items: [{ custom: 'zoom', command: 'menu:zoom', variants: ['inline', 'button'] }],
              importance: 2,
            },
            { items: ['panel:search', { custom: 'night' }], importance: 4 },
          ],
        },
        selection: { place: { at: 'selection' }, center: [['selection:copy']] },
      },
      menus: {
        zoom: [
          ['zoom:fit-page', 'zoom:fit-width'],
          ['zoom:100', 'zoom:150', 'zoom:200'],
        ],
      },
      panels: {
        outline: {
          side: 'start',
          title: 'Contents',
          icon: 'contents',
          present: { medium: 'overlay', expanded: 'overlay' },
        },
        thumbnails: { side: 'start', title: 'Pages', icon: 'pages', present: 'sheet' },
        search: { side: 'end', title: 'Find', icon: 'search', present: { expanded: 'overlay' } },
      },
      tabs: 'never',
    },
    plugins: {
      // A book: two facing pages, one spread at a time, all of it in view. One page when the
      // viewer is taller than it is wide.
      stage: {
        flow: 'paged',
        spread: 'odd',
        zoom: { mode: 'fit-page' },
        padding: 56,
        gap: 0,
        responsive: [
          { when: { orientation: 'portrait' }, settings: { spread: 'none', padding: 16 } },
        ],
      },
    },
  };

  let nightMode = $state(false);
  const theme = $derived<ViewerConfig['theme']>({
    preference: nightMode ? 'dark' : 'light',
    tokens: paper,
    dark: night,
  });
</script>

<PDFViewer src={article} {...config} {theme} style="height: 100%">
  <ToolbarItem id="night">
    <Button
      icon={nightMode ? 'sun' : 'moon'}
      label={nightMode ? 'Paper' : 'Night'}
      onclick={() => (nightMode = !nightMode)}
    />
  </ToolbarItem>
</PDFViewer>
