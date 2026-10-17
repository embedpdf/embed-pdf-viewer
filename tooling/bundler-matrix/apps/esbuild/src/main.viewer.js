import EmbedPDF from '@embedpdf/viewer/portable';
import { runViewerProbe } from '@embedpdf/bundler-probe/viewer';

runViewerProbe(document.getElementById('probe'), EmbedPDF);
