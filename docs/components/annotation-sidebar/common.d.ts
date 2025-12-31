import { PdfAnnotationObject } from '@embedpdf/models';
import { AnnotationTool, TrackedAnnotation } from '@embedpdf/plugin-annotation';
export interface SidebarPropsBase<T extends PdfAnnotationObject = PdfAnnotationObject> {
    documentId: string;
    selected: TrackedAnnotation<T> | null;
    activeTool: AnnotationTool<T> | null;
    colorPresets: string[];
    intent?: string;
}
//# sourceMappingURL=common.d.ts.map