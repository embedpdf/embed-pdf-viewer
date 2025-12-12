import { PdfAnnotationObject, PdfAnnotationSubtype, PdfPolygonAnnoObject } from '@embedpdf/models';
import {
  isSidebarAnnotation,
  SidebarSubtype,
  TrackedAnnotation,
} from '@embedpdf/plugin-annotation';

// Annotation type configuration
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

export const annotationConfigs: Record<SidebarSubtype, AnnotationConfig> = {
  [PdfAnnotationSubtype.HIGHLIGHT]: {
    label: 'Highlight',
    icon: 'highlight',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#ffff00',
    }),
  },
  [PdfAnnotationSubtype.CIRCLE]: {
    label: 'Circle',
    icon: 'circle',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
      secondaryColor: annotation.color,
    }),
  },
  [PdfAnnotationSubtype.SQUARE]: {
    label: 'Square',
    icon: 'square',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
      secondaryColor: annotation.color,
    }),
  },
  [PdfAnnotationSubtype.LINE]: {
    label: 'Line',
    icon: 'line',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
    }),
  },
  [PdfAnnotationSubtype.UNDERLINE]: {
    label: 'Underline',
    icon: 'underline',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.SQUIGGLY]: {
    label: 'Squiggly',
    icon: 'squiggly',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.STRIKEOUT]: {
    label: 'Strikethrough',
    icon: 'strikethrough',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.INK]: {
    label: 'Ink',
    icon: 'pencilMarker',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.color || '#000000',
    }),
  },
  [PdfAnnotationSubtype.FREETEXT]: {
    label: 'Text',
    icon: 'text',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.fontColor || '#000000',
    }),
  },
  [PdfAnnotationSubtype.POLYGON]: {
    label: 'Polygon',
    icon: 'polygon',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
      secondaryColor: annotation.color,
    }),
  },
  [PdfAnnotationSubtype.POLYLINE]: {
    label: 'Polyline',
    icon: 'zigzag',
    iconProps: (annotation: any) => ({
      primaryColor: annotation.strokeColor || '#000000',
    }),
  },
  [PdfAnnotationSubtype.STAMP]: {
    label: 'Stamp',
    icon: 'deviceFloppy',
    iconProps: () => ({
      primaryColor: '#dc2626',
    }),
  },
};

export const getAnnotationConfig = (annotation: TrackedAnnotation): AnnotationConfig | null => {
  if (!isSidebarAnnotation(annotation)) {
    return null;
  }
  return annotationConfigs[annotation.object.type];
};
