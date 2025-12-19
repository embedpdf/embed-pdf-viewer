/** @jsxImportSource preact */
import { h } from 'preact';
import { PdfAnnotationSubtype, PdfAnnotationObject } from '@embedpdf/models';
import { SidebarPropsBase } from './common';
import { InkSidebar } from './ink-sidebar';
import { TextMarkupSidebar } from './text-markup-sidebar';
import { ShapeSidebar } from './shape-sidebar';
import { PolygonSidebar } from './polygon-sidebar';
import { LineSidebar } from './line-sidebar';
import { FreeTextSidebar } from './free-text-sidebar';
import { StampSidebar } from './stamp-sidebar';

type SidebarComponent<S extends PdfAnnotationSubtype> = (
  p: SidebarPropsBase<Extract<PdfAnnotationObject, { type: S }>>,
) => h.JSX.Element | null;

interface SidebarEntry<S extends PdfAnnotationSubtype> {
  component: SidebarComponent<S>;
  /** Translation key for the sidebar title (e.g., 'annotation.ink') */
  titleKey?: string | ((p: SidebarPropsBase<Extract<PdfAnnotationObject, { type: S }>>) => string);
}

type SidebarRegistry = Partial<{
  [K in PdfAnnotationSubtype]: SidebarEntry<K>;
}>;

export const SidebarRegistry: SidebarRegistry = {
  [PdfAnnotationSubtype.INK]: { component: InkSidebar, titleKey: 'annotation.ink' },
  [PdfAnnotationSubtype.POLYGON]: { component: PolygonSidebar, titleKey: 'annotation.polygon' },
  [PdfAnnotationSubtype.SQUARE]: { component: ShapeSidebar, titleKey: 'annotation.square' },
  [PdfAnnotationSubtype.CIRCLE]: { component: ShapeSidebar, titleKey: 'annotation.circle' },

  [PdfAnnotationSubtype.LINE]: {
    component: LineSidebar,
    titleKey: (p) => (p.activeTool?.id === 'lineArrow' ? 'annotation.arrow' : 'annotation.line'),
  },
  [PdfAnnotationSubtype.POLYLINE]: { component: LineSidebar, titleKey: 'annotation.polyline' },

  [PdfAnnotationSubtype.HIGHLIGHT]: {
    component: TextMarkupSidebar,
    titleKey: 'annotation.highlight',
  },
  [PdfAnnotationSubtype.UNDERLINE]: {
    component: TextMarkupSidebar,
    titleKey: 'annotation.underline',
  },
  [PdfAnnotationSubtype.STRIKEOUT]: {
    component: TextMarkupSidebar,
    titleKey: 'annotation.strikeout',
  },
  [PdfAnnotationSubtype.SQUIGGLY]: {
    component: TextMarkupSidebar,
    titleKey: 'annotation.squiggly',
  },
  [PdfAnnotationSubtype.FREETEXT]: { component: FreeTextSidebar, titleKey: 'annotation.freeText' },
  [PdfAnnotationSubtype.STAMP]: { component: StampSidebar, titleKey: 'annotation.stamp' },
};
