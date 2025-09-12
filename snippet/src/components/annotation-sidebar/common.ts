import { PdfAnnotationObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface SidebarPropsBase<T extends PdfAnnotationObject = PdfAnnotationObject> {
  selected: TrackedAnnotation<T> | null; // null ⇒ editing tool defaults
  subtype: T['type']; // variant key of current tool
  activeVariant: string | null;
  colorPresets: string[];
  intent?: string;
}
