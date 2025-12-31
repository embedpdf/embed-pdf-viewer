import { h, JSX } from 'preact';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
type AnnotationMenuProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'style'> & {
    trackedAnnotation: TrackedAnnotation;
    style?: JSX.CSSProperties;
};
export declare const AnnotationMenu: ({ trackedAnnotation, ...props }: AnnotationMenuProps) => h.JSX.Element;
export {};
//# sourceMappingURL=annotation-menu.d.ts.map