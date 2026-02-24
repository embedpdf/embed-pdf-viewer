import { PdfDocumentObject, Rotation } from '@embedpdf/models';
import { PageLayout } from '@embedpdf/plugin-scroll';

export interface RenderPageProps extends PageLayout {
  rotation: Rotation;
  scale: number;
  document: PdfDocumentObject | null;
}
