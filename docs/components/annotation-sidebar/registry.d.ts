/** @jsxImportSource preact */
import { h } from 'preact';
import { PdfAnnotationSubtype, PdfAnnotationObject } from '@embedpdf/models';
import { SidebarPropsBase } from './common';
type SidebarComponent<S extends PdfAnnotationSubtype> = (p: SidebarPropsBase<Extract<PdfAnnotationObject, {
    type: S;
}>>) => h.JSX.Element | null;
interface SidebarEntry<S extends PdfAnnotationSubtype> {
    component: SidebarComponent<S>;
    /** Translation key for the sidebar title (e.g., 'annotation.ink') */
    titleKey?: string | ((p: SidebarPropsBase<Extract<PdfAnnotationObject, {
        type: S;
    }>>) => string);
}
type SidebarRegistry = Partial<{
    [K in PdfAnnotationSubtype]: SidebarEntry<K>;
}>;
export declare const SidebarRegistry: SidebarRegistry;
export {};
//# sourceMappingURL=registry.d.ts.map