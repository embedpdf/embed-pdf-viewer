import { PdfAnnotationObject } from '@embedpdf/models';
import { SidebarSubtype, TrackedAnnotation } from '@embedpdf/plugin-annotation';
export interface AnnotationConfig {
    label: string;
    icon: string;
    iconProps: (annotation: PdfAnnotationObject) => {
        primaryColor?: string;
        secondaryColor?: string;
        size?: number;
        strokeWidth?: number;
    };
}
export declare const annotationConfigs: Record<SidebarSubtype, AnnotationConfig>;
export declare const getAnnotationConfig: (annotation: TrackedAnnotation) => AnnotationConfig | null;
//# sourceMappingURL=config.d.ts.map