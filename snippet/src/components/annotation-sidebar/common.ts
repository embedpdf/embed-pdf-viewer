import { PdfAnnotationObject } from '@embedpdf/models';
import { AnnotationTool, TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface SidebarPropsBase<T extends PdfAnnotationObject = PdfAnnotationObject> {
  selected: TrackedAnnotation<T> | null; // null ⇒ editing tool defaults
  activeTool: AnnotationTool<T> | null;
  colorPresets: string[];
  intent?: string;
}
