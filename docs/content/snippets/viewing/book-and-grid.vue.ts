import { stagePlugin } from '@embedpdf/vue/stage';

// A book: facing pages, one spread at a time
stagePlugin({ flow: 'paged', spread: 'odd' });

// A thumbnail grid that wraps to the available width
stagePlugin({ layout: 'grid', columns: 'auto', zoom: { pageWidth: 150 } });
