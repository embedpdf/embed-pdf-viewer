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
  title?: string | ((p: SidebarPropsBase<Extract<PdfAnnotationObject, { type: S }>>) => string);
}

type SidebarRegistry = Partial<{
  [K in PdfAnnotationSubtype]: SidebarEntry<K>;
}>;

export const SidebarRegistry: SidebarRegistry = {
  [PdfAnnotationSubtype.INK]: { component: InkSidebar, title: 'Ink' },
  [PdfAnnotationSubtype.POLYGON]: { component: PolygonSidebar, title: 'Polygon' },
  [PdfAnnotationSubtype.SQUARE]: { component: ShapeSidebar, title: 'Square' },
  [PdfAnnotationSubtype.CIRCLE]: { component: ShapeSidebar, title: 'Circle' },

  [PdfAnnotationSubtype.LINE]: {
    component: LineSidebar,
    title: (p) => (p.activeTool?.id === 'lineArrow' ? 'Arrow' : 'Line'),
  },
  [PdfAnnotationSubtype.POLYLINE]: { component: LineSidebar, title: 'Polyline' },

  [PdfAnnotationSubtype.HIGHLIGHT]: { component: TextMarkupSidebar, title: 'Highlight' },
  [PdfAnnotationSubtype.UNDERLINE]: { component: TextMarkupSidebar, title: 'Underline' },
  [PdfAnnotationSubtype.STRIKEOUT]: { component: TextMarkupSidebar, title: 'Strikeout' },
  [PdfAnnotationSubtype.SQUIGGLY]: { component: TextMarkupSidebar, title: 'Squiggly' },
  [PdfAnnotationSubtype.FREETEXT]: { component: FreeTextSidebar, title: 'Free text' },
  [PdfAnnotationSubtype.STAMP]: { component: StampSidebar, title: 'Stamp' },
};
