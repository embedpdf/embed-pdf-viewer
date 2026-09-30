import { withStage } from '@embedpdf/angular/stage';

// A book: facing pages, one spread at a time
withStage({ flow: 'paged', spread: 'odd' });

// A thumbnail grid that wraps to the available width
withStage({ layout: 'grid', columns: 'auto', zoom: { pageWidth: 150 } });
